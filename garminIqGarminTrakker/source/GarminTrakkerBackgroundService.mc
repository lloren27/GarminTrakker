import Toybox.Application.Storage;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

(:background)
class GarminTrakkerBackgroundService extends System.ServiceDelegate {
    public function initialize() {
        ServiceDelegate.initialize();
    }

    public function onTemporalEvent() as Void {
        scheduleNextSync();

        var deviceId = Storage.getValue("deviceId");
        if (!(deviceId instanceof String)) {
            finish("OPEN FIELD");
            return;
        }

        var deviceToken = Storage.getValue("deviceToken");
        if (deviceToken instanceof String) {
            sendLatestTelemetry(deviceToken);
            return;
        }

        var pairingCode = Storage.getValue("pairingCode");
        if (pairingCode instanceof String) {
            pollPairingStatus(deviceId, pairingCode);
            return;
        }

        requestPairingCode(deviceId);
    }

    private function scheduleNextSync() as Void {
        try {
            Background.registerForTemporalEvent(
                new Time.Duration(GarminTrakkerConfig.LEGACY_SYNC_INTERVAL_SECONDS)
            );
        } catch (ex) {
            System.println("GarminTrakker schedule error: " + ex.toString());
        }
    }

    private function getJsonOptions(headers as Dictionary) as Dictionary {
        return {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => headers,
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
    }

    private function requestPairingCode(deviceId as String) as Void {
        Storage.setValue("backgroundStatus", "GET CODE");

        try {
            Communications.makeWebRequest(
                GarminTrakkerConfig.PAIRING_START_URL,
                {
                    "deviceId" => deviceId,
                    "model" => "Garmin Edge 530"
                },
                getJsonOptions({
                    "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
                }),
                method(:onPairingCodeResponse)
            );
        } catch (ex) {
            finish("PAIR ERR");
        }
    }

    public function onPairingCodeResponse(
        responseCode as Number,
        data as Dictionary or String or Null
    ) as Void {
        if (responseCode == 201 && data instanceof Dictionary) {
            var pairingCode = data["pairingCode"];
            if (pairingCode instanceof String) {
                Storage.setValue("pairingCode", pairingCode);
                finish("ENTER IN WEB");
                return;
            }
        }

        finish("PAIR ERR " + responseCode.toString());
    }

    private function pollPairingStatus(deviceId as String, pairingCode as String) as Void {
        Storage.setValue("backgroundStatus", "WAIT WEB");

        try {
            Communications.makeWebRequest(
                GarminTrakkerConfig.PAIRING_STATUS_URL,
                {
                    "deviceId" => deviceId,
                    "pairingCode" => pairingCode
                },
                getJsonOptions({
                    "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
                }),
                method(:onPairingStatusResponse)
            );
        } catch (ex) {
            finish("PAIR ERR");
        }
    }

    public function onPairingStatusResponse(
        responseCode as Number,
        data as Dictionary or String or Null
    ) as Void {
        if (responseCode == 404) {
            Storage.deleteValue("pairingCode");
            finish("NEW CODE NEXT");
            return;
        }

        if (responseCode == 200 && data instanceof Dictionary) {
            var deviceToken = data["deviceToken"];
            if (deviceToken instanceof String) {
                Storage.deleteValue("liveSummary");
                Storage.setValue("deviceToken", deviceToken);
                Storage.deleteValue("pairingCode");
                finish("LINKED");
                return;
            }

            finish("WAIT WEB");
            return;
        }

        finish("PAIR ERR " + responseCode.toString());
    }

    private function sendLatestTelemetry(deviceToken as String) as Void {
        var telemetry = Storage.getValue("latestTelemetry");
        if (!(telemetry instanceof Dictionary)) {
            finish("WAIT GPS");
            return;
        }

        Storage.setValue("backgroundStatus", "SYNCING");

        try {
            Communications.makeWebRequest(
                GarminTrakkerConfig.LIVE_UPDATE_URL,
                telemetry as Dictionary,
                getJsonOptions({
                    "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                    "Authorization" => "Bearer " + deviceToken
                }),
                method(:onLiveUpdateResponse)
            );
        } catch (ex) {
            finish("SYNC ERR");
        }
    }

    public function onLiveUpdateResponse(
        responseCode as Number,
        data as Dictionary or String or Null
    ) as Void {
        if (responseCode == 401) {
            Storage.deleteValue("deviceToken");
            Storage.deleteValue("pairingCode");
            Storage.deleteValue("liveSummary");
            finish("PAIR AGAIN");
            return;
        }

        if (responseCode == 200 && data instanceof Dictionary) {
            Storage.setValue("liveSummary", {
                "ahead" => data["ahead"],
                "behind" => data["behind"],
                "progressMeters" => data["progressMeters"],
                "remainingMeters" => data["remainingMeters"],
                "progressPercent" => data["progressPercent"],
                "distanceFromRouteMeters" => data["distanceFromRouteMeters"],
                "isOffRoute" => data["isOffRoute"],
                "rank" => data["rank"],
                "participantCount" => data["participantCount"],
                "syncedAtEpoch" => Time.now().value()
            });
            finish("SYNC OK 5M");
            return;
        }

        finish("HTTP " + responseCode.toString());
    }

    private function finish(status as String) as Void {
        Storage.setValue("backgroundStatus", status);
        Background.exit(status);
    }
}
