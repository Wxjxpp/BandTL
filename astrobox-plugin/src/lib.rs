use astrobox_ng_wit::FutureReader;

use astrobox_ng_wit::exports::astrobox::psys_plugin::{
    event_v3::{self, EventType},
    lifecycle,
};

pub mod logger;
pub mod ui;

struct MyPlugin;

impl event_v3::Guest for MyPlugin {
    fn on_event(_event_type: EventType, _event_payload: String) -> FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(|| "".to_string());
        astrobox_ng_wit::spawn(async move {
            let _ = writer.write("".to_string()).await;
        });
        reader
    }

    fn on_ui_event_v3(
        event_id: String,
        event: event_v3::Event,
        _event_payload: String,
    ) -> FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(|| "".to_string());
        // 关键：导入流程（含文件选择器）必须在事件 future 内 await 完成，
        // 否则 future 提前 resolve 会导致宿主停止轮询，文件选择器无法拉起。
        astrobox_ng_wit::spawn(async move {
            ui::ui_event_processor(event, &event_id).await;
            let _ = writer.write("".to_string()).await;
        });
        reader
    }

    fn on_ui_render(element_id: String) -> FutureReader<()> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<()>(|| ());
        ui::render_main_ui(&element_id);
        astrobox_ng_wit::spawn(async move {
            let _ = writer.write(()).await;
        });
        reader
    }

    fn on_card_render(_card_id: String) -> FutureReader<()> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<()>(|| ());
        astrobox_ng_wit::spawn(async move {
            let _ = writer.write(()).await;
        });
        reader
    }
}

impl lifecycle::Guest for MyPlugin {
    fn on_load() -> () {
        logger::init();
        tracing::info!("BandTL 词典导入插件已加载 (v1.0.6)");
    }
}

astrobox_ng_wit::export!(MyPlugin);
