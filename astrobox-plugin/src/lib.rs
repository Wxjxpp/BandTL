use astrobox_ng_wit::FutureReader;

use astrobox_ng_wit::exports::astrobox::psys_plugin::{
    event_v3::{self, EventType},
    lifecycle,
};

pub mod logger;
pub mod ui;

struct MyPlugin;

impl event_v3::Guest for MyPlugin {
    fn on_event(event_type: EventType, _event_payload: String) -> FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(|| "".to_string());
        // 设备连接/断开时自动刷新 UI 上的设备状态
        if matches!(event_type, EventType::DeviceAction) {
            ui::on_device_changed();
        }
        astrobox_ng_wit::spawn(async move {
            let _ = writer.write("".to_string()).await;
        });
        reader
    }

    fn on_ui_event_v3(
        event_id: String,
        event: event_v3::Event,
        event_payload: String,
    ) -> FutureReader<String> {
        let (writer, reader) = astrobox_ng_wit::wit_future::new::<String>(|| "".to_string());
        ui::ui_event_processor(event, &event_id, &event_payload);
        astrobox_ng_wit::spawn(async move {
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
        tracing::info!("BandTL 词典导入插件已加载 (v1.1.0)");
    }
}

astrobox_ng_wit::export!(MyPlugin);
