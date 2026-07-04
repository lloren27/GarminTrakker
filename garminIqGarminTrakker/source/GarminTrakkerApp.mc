import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

(:background)
class GarminTrakkerApp extends Application.AppBase {

    public function initialize() {
        AppBase.initialize();
    }

    public function onStart(state as Dictionary?) as Void {
        if (GarminTrakkerBuild.IS_LEGACY) {
            scheduleInitialLegacySync();
        }
    }

    public function onStop(state as Dictionary?) as Void {
    }

    public function getInitialView() as [Views] or [Views, InputDelegates] {
        if (GarminTrakkerBuild.IS_LEGACY) {
            return [new GarminTrakkerLegacyField()];
        }

        return [new GarminTrakkerLiveField()];
    }

    public function getServiceDelegate() as [ServiceDelegate] {
        return [new GarminTrakkerBackgroundService()];
    }

    public function onBackgroundData(data as PersistableType) as Void {
        if (data instanceof String) {
            Storage.setValue("backgroundStatus", data);
        }

        WatchUi.requestUpdate();
    }

    private function scheduleInitialLegacySync() as Void {
        if (Background.getTemporalEventRegisteredTime() != null) {
            return;
        }

        try {
            Background.registerForTemporalEvent(Time.now());
            Storage.setValue("backgroundStatus", "PREP CODE");
        } catch (ex) {
            try {
                Background.registerForTemporalEvent(
                    new Time.Duration(GarminTrakkerConfig.LEGACY_SYNC_INTERVAL_SECONDS)
                );
                Storage.setValue("backgroundStatus", "CODE <=5 MIN");
            } catch (scheduleEx) {
                Storage.setValue("backgroundStatus", "BG ERROR");
                System.println("GarminTrakker initial schedule error: " + scheduleEx.toString());
            }
        }
    }
}
