import Toybox.Activity;
import Toybox.Application.Storage;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

class GarminTrakkerField extends WatchUi.DataField {
    private var _distanceMeters as Float?;
    private var _hasLocation as Boolean;
    private var _status as String;
    private var _lastSendEpoch as Number;
    private var _requestInFlight as Boolean;
    private var _aheadLabel as String;
    private var _behindLabel as String;
    private var _deviceId as String;
    private var _deviceToken as String?;
    private var _pairingCode as String?;
    private var _lastPairingRequestEpoch as Number;

    public function initialize() {
        DataField.initialize();

        _distanceMeters = null;
        _hasLocation = false;
        _status = "WAIT GPS";
        _lastSendEpoch = 0;
        _requestInFlight = false;
        _aheadLabel = "UP --";
        _behindLabel = "DN --";
        _deviceId = getDeviceId();
        _deviceToken = getStoredDeviceToken();
        _pairingCode = null;
        _lastPairingRequestEpoch = 0;

        if (_deviceToken == null) {
            _status = "PAIRING";
        }
    }

    public function compute(info as Activity.Info) as Void {
        _distanceMeters = info.elapsedDistance;
        _hasLocation = info.currentLocation != null;

        if (_deviceToken == null) {
            handlePairing();
            return;
        }

        if (_hasLocation) {
            _status = "READY";
            sendLocationIfDue(info);
        } else {
            _status = "WAIT GPS";
        }
    }

    public function onUpdate(dc as Graphics.Dc) as Void {
        var bgColor = getBackgroundColor();
        var fgColor = Graphics.COLOR_WHITE;

        if (bgColor == Graphics.COLOR_WHITE) {
            fgColor = Graphics.COLOR_BLACK;
        }

        dc.setColor(fgColor, bgColor);
        dc.clear();

        var width = dc.getWidth();
        var height = dc.getHeight();
        var centerX = width / 2;

        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, 8, Graphics.FONT_SMALL, "GarminTrakker", Graphics.TEXT_JUSTIFY_CENTER);

        if (_deviceToken == null) {
            drawPairingView(dc, centerX, height, fgColor);
            return;
        }

        var distanceLabel = formatDistance(_distanceMeters);
        dc.drawText(centerX, 50, Graphics.FONT_SMALL, _aheadLabel, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(centerX, height / 2, Graphics.FONT_NUMBER_MEDIUM, distanceLabel, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(centerX, height - 70, Graphics.FONT_SMALL, _behindLabel, Graphics.TEXT_JUSTIFY_CENTER);

        dc.drawText(
            centerX,
            height - 36,
            Graphics.FONT_SMALL,
            _status,
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }

    private function drawPairingView(dc as Graphics.Dc, centerX as Number, height as Number, fgColor as Number) as Void {
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, 48, Graphics.FONT_SMALL, "VINCULAR EN WEB", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(
            centerX,
            height / 2,
            Graphics.FONT_NUMBER_MEDIUM,
            _pairingCode != null ? _pairingCode : "....",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER
        );
        dc.drawText(centerX, height - 44, Graphics.FONT_SMALL, _status, Graphics.TEXT_JUSTIFY_CENTER);
    }

    private function getDeviceId() as String {
        var identifier = System.getDeviceSettings().uniqueIdentifier;

        if (identifier instanceof String) {
            return identifier;
        }

        return "garmintrakker-device";
    }

    private function getStoredDeviceToken() as String? {
        var storedToken = Storage.getValue("deviceToken");

        if (storedToken instanceof String && storedToken.length() > 0) {
            return storedToken;
        }

        return null;
    }

    private function handlePairing() as Void {
        if (_requestInFlight) {
            return;
        }

        var now = Time.now().value();

        if (_pairingCode == null) {
            if ((now - _lastPairingRequestEpoch) >= GarminTrakkerConfig.PAIRING_POLL_SECONDS) {
                requestPairingCode(now);
            }
            return;
        }

        if ((now - _lastPairingRequestEpoch) >= GarminTrakkerConfig.PAIRING_POLL_SECONDS) {
            pollPairingStatus(now);
        }
    }

    private function requestPairingCode(now as Number) as Void {
        var params = {
            "deviceId" => _deviceId,
            "model" => "Garmin Edge"
        };
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        _requestInFlight = true;
        _lastPairingRequestEpoch = now;
        _status = "GET CODE";

        try {
            Communications.makeWebRequest(
                GarminTrakkerConfig.PAIRING_START_URL,
                params,
                options,
                method(:onPairingCodeResponse)
            );
        } catch (ex) {
            _requestInFlight = false;
            _status = "PAIR ERR";
            System.println("GarminTrakker pairing start error: " + ex.toString());
        }
    }

    public function onPairingCodeResponse(responseCode as Number, data as Dictionary or String or Null) as Void {
        _requestInFlight = false;

        if (responseCode != 201 || !(data instanceof Dictionary)) {
            _status = "PAIR ERR " + responseCode.toString();
            return;
        }

        var pairingCode = data["pairingCode"];
        if (pairingCode instanceof String) {
            _pairingCode = pairingCode;
            _status = "ENTER IN WEB";
        }
    }

    private function pollPairingStatus(now as Number) as Void {
        var params = {
            "deviceId" => _deviceId,
            "pairingCode" => _pairingCode
        };
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        _requestInFlight = true;
        _lastPairingRequestEpoch = now;
        _status = "WAIT WEB";

        try {
            Communications.makeWebRequest(
                GarminTrakkerConfig.PAIRING_STATUS_URL,
                params,
                options,
                method(:onPairingStatusResponse)
            );
        } catch (ex) {
            _requestInFlight = false;
            _status = "PAIR ERR";
            System.println("GarminTrakker pairing status error: " + ex.toString());
        }
    }

    public function onPairingStatusResponse(responseCode as Number, data as Dictionary or String or Null) as Void {
        _requestInFlight = false;

        if (responseCode == 404) {
            _pairingCode = null;
            _status = "NEW CODE";
            return;
        }

        if (responseCode != 200 || !(data instanceof Dictionary)) {
            _status = "PAIR ERR " + responseCode.toString();
            return;
        }

        var deviceToken = data["deviceToken"];
        if (deviceToken instanceof String && deviceToken.length() > 0) {
            Storage.setValue("deviceToken", deviceToken);
            _deviceToken = deviceToken;
            _pairingCode = null;
            _status = "LINKED";
            _lastSendEpoch = 0;
        } else {
            _status = "WAIT WEB";
        }
    }

    private function formatDistance(distanceMeters as Float?) as String {
        if (distanceMeters == null) {
            return "--.- km";
        }

        return (distanceMeters / 1000.0f).format("%.1f") + " km";
    }

    private function sendLocationIfDue(info as Activity.Info) as Void {
        if (_requestInFlight) {
            return;
        }

        var location = info.currentLocation;
        if (location == null) {
            return;
        }

        var now = Time.now().value();
        if ((now - _lastSendEpoch) < GarminTrakkerConfig.SEND_INTERVAL_SECONDS) {
            return;
        }

        var position = location.toDegrees();
        var elapsedDistance = info.elapsedDistance;

        if ((position == null) || (elapsedDistance == null)) {
            return;
        }

        var params = {
            "latitude" => position[0],
            "longitude" => position[1],
            "elapsedDistanceMeters" => elapsedDistance,
            "recordedAtEpoch" => now
        };
        if (info.averageSpeed != null) {
            params["averageSpeedMps"] = info.averageSpeed;
        }
        if (info.currentSpeed != null) {
            params["currentSpeedMps"] = info.currentSpeed;
        }
        if (info.timerTime != null) {
            params["timerTimeSeconds"] = info.timerTime / 1000.0f;
        }

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + _deviceToken
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        _requestInFlight = true;
        _lastSendEpoch = now;
        _status = "SENDING";

        try {
            Communications.makeWebRequest(
                GarminTrakkerConfig.LIVE_UPDATE_URL,
                params,
                options,
                method(:onLiveUpdateResponse)
            );
        } catch (ex) {
            _requestInFlight = false;
            _status = "SEND ERR";
            System.println("GarminTrakker request error: " + ex.toString());
        }
    }

    public function onLiveUpdateResponse(responseCode as Number, data as Dictionary or String or Null) as Void {
        _requestInFlight = false;

        if (responseCode == 401) {
            Storage.deleteValue("deviceToken");
            _deviceToken = null;
            _pairingCode = null;
            _lastPairingRequestEpoch = 0;
            _status = "PAIR AGAIN";
            return;
        }

        if (responseCode != 200) {
            _status = "HTTP " + responseCode.toString();
            return;
        }

        if (data instanceof Dictionary) {
            updatePeerLabels(data);
        }

        _status = "SYNC OK";
    }

    private function updatePeerLabels(data as Dictionary) as Void {
        var ahead = data["ahead"];
        var behind = data["behind"];

        _aheadLabel = formatPeer("UP", ahead);
        _behindLabel = formatPeer("DN", behind);
    }

    private function formatPeer(prefix as String, peer as Object?) as String {
        if (!(peer instanceof Dictionary)) {
            return prefix + " --";
        }

        var name = peer["name"];
        var deltaMeters = peer["deltaMeters"];

        if (!(name instanceof String) || !(deltaMeters instanceof Number)) {
            return prefix + " --";
        }

        var gapSeconds = peer["gapSeconds"];
        var label = prefix + " " + name + " " + formatDelta(deltaMeters);

        if (gapSeconds instanceof Number) {
            label += " " + formatGapTime(gapSeconds);
        }

        return label;
    }

    private function formatDelta(deltaMeters as Number) as String {
        if (deltaMeters >= 1000) {
            return (deltaMeters / 1000.0f).format("%.1f") + "km";
        }

        return deltaMeters.format("%d") + "m";
    }

    private function formatGapTime(seconds as Number) as String {
        if (seconds < 60) {
            return seconds.format("%d") + "s";
        }

        return (seconds / 60).format("%d") + "m";
    }
}
