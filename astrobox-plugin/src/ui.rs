use astrobox_ng_wit::astrobox::psys_host::{self, dialog, device, interconnect, ui_v3};
use std::sync::{Mutex, OnceLock};

/// 按钮 event id
pub const EVT_PICK_FILE: &str = "pick_file";

/// 手环词典快应用包名（与手环侧 manifest.json 的 package 一致）
const PKG_NAME: &str = "com.wristband.dict";

/// 单条 interconnect 消息的字符块大小。
/// 词典 JSON 文本是 UTF-8，按字符切块保证不截断多字节字符。
/// 2048 字符在保证手环侧处理速度的同时不会触发单条消息过大。
const CHUNK_CHARS: usize = 2048;

struct UiState {
    root_element_id: Option<String>,
    status: String,
    busy: bool,
}

static UI_STATE: OnceLock<Mutex<UiState>> = OnceLock::new();

fn ui_state() -> &'static Mutex<UiState> {
    UI_STATE.get_or_init(|| {
        Mutex::new(UiState {
            root_element_id: None,
            status: String::new(),
            busy: false,
        })
    })
}

/// 设置忙碌状态（禁用按钮），同时刷新 UI。在同步与异步上下文均可调用。
fn set_busy(busy: bool, msg: &str) {
    let root = {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        s.busy = busy;
        s.status = msg.to_string();
        s.root_element_id.clone()
    };
    if let Some(id) = root {
        psys_host::ui_v3::render(&id, build_main_ui());
    }
}

/// UI 事件分发（由 on_ui_event_v3 的异步任务调用）。
/// 必须在事件 future 内 await 完成，否则文件选择器无法拉起。
pub async fn ui_event_processor(evtype: ui_v3::Event, event_id: &str) {
    if !matches!(evtype, ui_v3::Event::Click) {
        return;
    }
    if event_id != EVT_PICK_FILE {
        return;
    }
    // 防止重复点击
    let busy = ui_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .busy;
    if busy {
        return;
    }
    do_import().await;
}

/// 主导入流程：选文件 → 校验 → 获取设备 → 分块 → interconnect 推送到手环。
/// 顺序上先弹文件选择器，让用户立即得到反馈；再检查设备连接。
async fn do_import() {
    set_busy(true, "正在打开文件选择器…");

    // 1. 弹出文件选择器，让用户选择本地 JSON 词典
    let cfg = dialog::PickConfig {
        read: true,
        copy_to: None,
    };
    let filter = dialog::FilterConfig {
        multiple: false,
        extensions: vec!["json".to_string()],
        default_directory: String::new(),
        default_file_name: String::new(),
    };
    let picked = dialog::pick_file(&cfg, &filter).await;

    // 用户取消时宿主通常返回空 data
    if picked.data.is_empty() {
        set_busy(false, "未选择文件或文件为空");
        return;
    }

    set_busy(true, &format!("已选择：{}", picked.name));

    // 2. 解码为 UTF-8 文本
    let content = match String::from_utf8(picked.data.clone()) {
        Ok(s) => s,
        Err(_) => {
            set_busy(false, "文件不是有效的 UTF-8 文本，无法推送");
            return;
        }
    };

    // 3. 基础校验：能否作为 JSON 解析
    if serde_json::from_str::<serde_json::Value>(&content).is_err() {
        set_busy(false, "文件不是合法的 JSON，已中止");
        return;
    }

    // 4. 获取已连接的手环设备
    set_busy(true, "正在查找已连接的手环…");
    let devices = device::get_connected_device_list().await;
    let dev = match devices.first() {
        Some(d) => d.clone(),
        None => {
            set_busy(false, "未发现已连接的手环，请先在 AstroBox 连接小米手环9 Pro");
            return;
        }
    };

    // 5. 分块推送
    let chars: Vec<char> = content.chars().collect();
    let total = chars.len().div_ceil(CHUNK_CHARS);
    set_busy(true, &format!("开始推送：共 {} 块…", total));

    // start 帧
    let start = format!(
        "{{\"type\":\"start\",\"name\":\"{}\",\"total\":{}}}",
        json_escape(&picked.name),
        total
    );
    if interconnect::send_qaic_message(&dev.addr, PKG_NAME, &start)
        .await
        .is_err()
    {
        set_busy(false, "推送失败（start 帧），请确认手环词典应用已打开");
        return;
    }

    // chunk 帧
    let mut idx: usize = 0;
    let mut pos: usize = 0;
    while pos < chars.len() {
        let end = (pos + CHUNK_CHARS).min(chars.len());
        let chunk: String = chars[pos..end].iter().collect();
        let msg = format!(
            "{{\"type\":\"chunk\",\"index\":{},\"content\":\"{}\"}}",
            idx,
            json_escape(&chunk)
        );
        if interconnect::send_qaic_message(&dev.addr, PKG_NAME, &msg)
            .await
            .is_err()
        {
            set_busy(false, &format!("推送失败（第 {} 块）", idx + 1));
            return;
        }
        idx += 1;
        pos = end;
        // 每 5 块更新一次进度，避免频繁刷新 UI 拖慢推送
        if idx % 5 == 0 || pos == chars.len() {
            set_busy(true, &format!("推送中… {}/{}", idx, total));
        }
    }

    // end 帧
    let _ = interconnect::send_qaic_message(&dev.addr, PKG_NAME, "{\"type\":\"end\"}").await;

    set_busy(false, &format!("完成：已推送 {} 块，请回到手环查看词典", total));
}

/// JSON 字符串转义（用于手工拼接协议帧）。
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// 构造主界面 UI。
pub fn build_main_ui() -> ui_v3::Element {
    let state = ui_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let status = state.status.clone();
    let busy = state.busy;
    drop(state);

    let title = ui_v3::Element::new(ui_v3::ElementType::P, Some("BandTL 词典导入"))
        .size(28)
        .text_color("#ffffff");

    let desc = ui_v3::Element::new(
        ui_v3::ElementType::P,
        Some("选择本地的 JSON 词典文件，将自动分块推送到已连接的小米手环9 Pro。"),
    )
    .size(14)
    .text_color("#888888");

    let mut btn = ui_v3::Element::new(ui_v3::ElementType::Button, Some("选择词典文件"))
        .bg("#09ba07")
        .text_color("#ffffff")
        .width_full()
        .height(48)
        .radius(12)
        .on(ui_v3::Event::Click, EVT_PICK_FILE);
    if busy {
        btn = btn.disabled();
    }

    let status_el = ui_v3::Element::new(ui_v3::ElementType::P, Some(status.as_str()))
        .size(14)
        .text_color("#aaaaaa");

    ui_v3::Element::new(ui_v3::ElementType::Div, None)
        .flex()
        .flex_direction(ui_v3::FlexDirection::Column)
        .width_full()
        .padding(20)
        .child(title)
        .child(desc)
        .child(btn)
        .child(status_el)
}

/// 宿主要求渲染主界面时调用。
pub fn render_main_ui(element_id: &str) {
    {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        s.root_element_id = Some(element_id.to_string());
    }
    psys_host::ui_v3::render(element_id, build_main_ui());
}
