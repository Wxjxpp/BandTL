use astrobox_ng_wit::astrobox::psys_host::{self, dialog, device, interconnect, register, ui_v3};
use astrobox_ng_wit as abx;
use std::sync::{Mutex, OnceLock};

// ===== 事件 ID =====
/// 注册连接按钮
pub const EVT_CONNECT: &str = "action:connect";
/// 选择文件按钮
pub const EVT_PICK_FILE: &str = "action:pick-file";
/// 推送词典按钮
pub const EVT_PUSH: &str = "action:push";
/// 刷新设备按钮
pub const EVT_REFRESH: &str = "action:refresh";

/// 手环词典快应用包名
const PKG_NAME: &str = "com.wristband.dict";

/// 单条 interconnect 消息的字符块大小
const CHUNK_CHARS: usize = 2048;

// ===== UI 状态 =====
struct UiState {
    root_element_id: Option<String>,
    /// 连接状态：未连接 / 已连接(设备名)
    device_addr: Option<String>,
    device_name: Option<String>,
    /// interconnect 注册是否成功
    registered: bool,
    /// 已选择的文件名和内容
    file_name: Option<String>,
    file_content: Option<String>,
    /// 状态消息
    status: String,
    /// 是否忙碌
    busy: bool,
}

static UI_STATE: OnceLock<Mutex<UiState>> = OnceLock::new();

fn ui_state() -> &'static Mutex<UiState> {
    UI_STATE.get_or_init(|| {
        Mutex::new(UiState {
            root_element_id: None,
            device_addr: None,
            device_name: None,
            registered: false,
            file_name: None,
            file_content: None,
            status: String::new(),
            busy: false,
        })
    })
}

/// 刷新 UI
fn rerender() {
    let id = {
        let s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.root_element_id.clone()
    };
    if let Some(id) = id {
        psys_host::ui_v3::render(&id, build_main_ui());
    }
}

/// 设置忙碌状态并刷新 UI
fn set_busy(busy: bool, msg: &str) {
    {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.busy = busy;
        s.status = msg.to_string();
    }
    rerender();
}

/// 设置状态消息并刷新 UI
fn set_status(msg: &str) {
    {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.status = msg.to_string();
    }
    rerender();
}

/// UI 事件分发
pub fn ui_event_processor(evtype: ui_v3::Event, event_id: &str, _payload: &str) {
    if !matches!(evtype, ui_v3::Event::Click) {
        return;
    }

    let busy = ui_state()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .busy;
    if busy {
        return;
    }

    match event_id {
        EVT_CONNECT => abx::block_on(do_connect()),
        EVT_PICK_FILE => abx::block_on(do_pick_file()),
        EVT_PUSH => abx::block_on(do_push()),
        EVT_REFRESH => abx::block_on(do_refresh()),
        _ => {}
    }
}

/// 查找已连接设备并注册 interconnect
async fn do_connect() {
    set_busy(true, "正在查找已连接的手环…");

    let devices = device::get_connected_device_list().await;

    if devices.is_empty() {
        {
            let mut s = ui_state()
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            s.device_addr = None;
            s.device_name = None;
            s.registered = false;
        }
        set_busy(false, "未发现已连接的手环，请先在 AstroBox 连接小米手环9 Pro");
        return;
    }

    let dev = devices[0].clone();
    {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.device_addr = Some(dev.addr.clone());
        s.device_name = Some(dev.name.clone());
    }

    set_busy(true, &format!("已连接：{}，正在注册…", dev.name));

    // 注册 interconnect 接收
    let result = register::register_interconnect_recv(&dev.addr, PKG_NAME).await;
    let registered = result.is_ok();

    {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.registered = registered;
    }

    if registered {
        // 发送 connected 帧通知手环端
        let _ = interconnect::send_qaic_message(&dev.addr, PKG_NAME, "{\"type\":\"connected\"}").await;
        set_busy(false, &format!("连接成功：{}，已注册通信", dev.name));
    } else {
        set_busy(false, &format!("已连接：{}，但注册通信失败", dev.name));
    }
}

/// 刷新设备列表（不注册）
async fn do_refresh() {
    set_busy(true, "正在刷新设备列表…");
    let devices = device::get_connected_device_list().await;

    if devices.is_empty() {
        {
            let mut s = ui_state()
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            s.device_addr = None;
            s.device_name = None;
            s.registered = false;
        }
        set_busy(false, "未发现已连接的设备");
    } else {
        let dev = devices[0].clone();
        {
            let mut s = ui_state()
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            s.device_addr = Some(dev.addr.clone());
            s.device_name = Some(dev.name.clone());
        }
        set_busy(false, &format!("发现设备：{}", dev.name));
    }
}

/// 选择文件
async fn do_pick_file() {
    set_busy(true, "正在打开文件选择器…");

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

    if picked.data.is_empty() {
        set_busy(false, "未选择文件或文件为空");
        return;
    }

    set_busy(true, &format!("已选择：{}，正在校验…", picked.name));

    // 解码为 UTF-8
    let content = match String::from_utf8(picked.data.clone()) {
        Ok(s) => s,
        Err(_) => {
            set_busy(false, "文件不是有效的 UTF-8 文本");
            return;
        }
    };

    // JSON 校验
    if serde_json::from_str::<serde_json::Value>(&content).is_err() {
        set_busy(false, "文件不是合法的 JSON");
        return;
    }

    {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.file_name = Some(picked.name.clone());
        s.file_content = Some(content);
    }

    set_busy(false, &format!("已选择：{}，点击推送按钮发送到手环", picked.name));
}

/// 推送词典到手环
async fn do_push() {
    let (addr, content, file_name) = {
        let s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        (
            s.device_addr.clone(),
            s.file_content.clone(),
            s.file_name.clone(),
        )
    };

    if addr.is_none() {
        set_status("请先点击注册连接");
        return;
    }
    if content.is_none() {
        set_status("请先选择词典文件");
        return;
    }

    let addr = addr.unwrap();
    let content = content.unwrap();
    let fname = file_name.unwrap_or_else(|| "词典".to_string());

    set_busy(true, "开始推送…");

    let chars: Vec<char> = content.chars().collect();
    let total = chars.len().div_ceil(CHUNK_CHARS);

    // start 帧
    let start = format!(
        "{{\"type\":\"start\",\"name\":\"{}\",\"total\":{}}}",
        json_escape(&fname),
        total
    );
    if interconnect::send_qaic_message(&addr, PKG_NAME, &start)
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
        if interconnect::send_qaic_message(&addr, PKG_NAME, &msg)
            .await
            .is_err()
        {
            set_busy(false, &format!("推送失败（第 {} 块）", idx + 1));
            return;
        }
        idx += 1;
        pos = end;
        if idx % 5 == 0 || pos == chars.len() {
            set_busy(true, &format!("推送中… {}/{}", idx, total));
        }
    }

    // end 帧
    let _ = interconnect::send_qaic_message(&addr, PKG_NAME, "{\"type\":\"end\"}").await;

    set_busy(false, &format!("推送完成：{} 块，请回到手环查看", total));
}

/// JSON 字符串转义
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

/// 构造主界面 UI
pub fn build_main_ui() -> ui_v3::Element {
    let state = ui_state()
        .lock()
        .unwrap_or_else(|p| p.into_inner());

    let connected = state.device_addr.is_some();
    let registered = state.registered;
    let has_file = state.file_name.is_some();
    let busy = state.busy;
    let status = state.status.clone();
    let dev_name = state.device_name.clone();
    let fname = state.file_name.clone();
    drop(state);

    // 颜色
    let color_text = "#f4f4f5";
    let color_muted = "#a1a1aa";
    let color_accent = "#60a5fa";
    let color_success = "#4ade80";
    let color_danger = "#f87171";
    let color_btn_primary = "#2563eb";
    let color_btn_ghost = "#27272a";
    let color_btn_success = "#16a34a";

    // 标题
    let title = ui_v3::Element::new(ui_v3::ElementType::P, Some("BandTL 词典导入"))
        .size(24)
        .text_color(color_text);

    let desc = ui_v3::Element::new(
        ui_v3::ElementType::P,
        Some("选择 JSON 词典文件，推送到小米手环9 Pro"),
    )
    .size(13)
    .text_color(color_muted);

    // 连接状态
    let conn_text = if !connected {
        "设备未连接".to_string()
    } else {
        let reg = if registered { "已注册" } else { "未注册" };
        format!("{} ({})", dev_name.as_deref().unwrap_or("未知设备"), reg)
    };
    let conn_color = if connected && registered {
        color_success
    } else if connected {
        color_accent
    } else {
        color_danger
    };
    let conn_status = ui_v3::Element::new(ui_v3::ElementType::P, Some(conn_text.as_str()))
        .size(14)
        .text_color(conn_color);

    // 文件状态
    let file_text = if has_file {
        format!("已选择：{}", fname.as_deref().unwrap_or(""))
    } else {
        "未选择文件".to_string()
    };
    let file_color = if has_file { color_success } else { color_muted };
    let file_status = ui_v3::Element::new(ui_v3::ElementType::P, Some(file_text.as_str()))
        .size(14)
        .text_color(file_color);

    // 按钮：注册连接
    let mut btn_connect = ui_v3::Element::new(
        ui_v3::ElementType::Button,
        Some(if connected { "重新注册连接" } else { "注册连接" }),
    )
    .bg(color_btn_primary)
    .text_color("#ffffff")
    .width_full()
    .height(44)
    .radius(10)
    .on(ui_v3::Event::Click, EVT_CONNECT);
    if busy {
        btn_connect = btn_connect.disabled();
    }

    // 按钮：选择文件
    let mut btn_pick = ui_v3::Element::new(
        ui_v3::ElementType::Button,
        Some(if has_file { "重新选择文件" } else { "选择词典文件" }),
    )
    .bg(color_btn_ghost)
    .text_color(color_text)
    .width_full()
    .height(44)
    .radius(10)
    .on(ui_v3::Event::Click, EVT_PICK_FILE);
    if busy {
        btn_pick = btn_pick.disabled();
    }

    // 按钮：推送
    let can_push = connected && has_file && !busy;
    let mut btn_push = ui_v3::Element::new(ui_v3::ElementType::Button, Some("推送到手环"))
        .bg(if can_push { color_btn_success } else { color_btn_ghost })
        .text_color("#ffffff")
        .width_full()
        .height(44)
        .radius(10)
        .on(ui_v3::Event::Click, EVT_PUSH);
    if !can_push {
        btn_push = btn_push.disabled();
    }

    // 按钮容器
    let btn_group = ui_v3::Element::new(ui_v3::ElementType::Div, None)
        .flex()
        .flex_direction(ui_v3::FlexDirection::Column)
        .width_full()
        .gap(8)
        .child(btn_connect)
        .child(btn_pick)
        .child(btn_push);

    // 状态消息
    let status_color = if status.starts_with("失败") || status.starts_with("推送失败") {
        color_danger
    } else if status.starts_with("完成") || status.starts_with("推送完成") {
        color_success
    } else {
        color_muted
    };
    let status_el = ui_v3::Element::new(ui_v3::ElementType::P, Some(status.as_str()))
        .size(13)
        .text_color(status_color);

    // 分隔线
    let separator = ui_v3::Element::new(ui_v3::ElementType::Separator, None);

    // 组装
    ui_v3::Element::new(ui_v3::ElementType::Div, None)
        .flex()
        .flex_direction(ui_v3::FlexDirection::Column)
        .width_full()
        .padding(20)
        .gap(12)
        .child(title)
        .child(desc)
        .child(separator)
        .child(conn_status)
        .child(file_status)
        .child(btn_group)
        .child(status_el)
}

/// 宿主要求渲染主界面时调用
pub fn render_main_ui(element_id: &str) {
    {
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.root_element_id = Some(element_id.to_string());
    }
    psys_host::ui_v3::render(element_id, build_main_ui());
}

/// 设备状态变化时调用（由 lib.rs 的 on_event 转发）
pub fn on_device_changed() {
    // 异步刷新设备列表
    abx::spawn(async {
        let devices = device::get_connected_device_list().await;
        let mut s = ui_state()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if let Some(dev) = devices.first() {
            s.device_addr = Some(dev.addr.clone());
            s.device_name = Some(dev.name.clone());
        } else {
            s.device_addr = None;
            s.device_name = None;
            s.registered = false;
        }
        drop(s);
        rerender();
    });
}
