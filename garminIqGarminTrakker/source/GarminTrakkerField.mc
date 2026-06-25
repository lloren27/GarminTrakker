import Toybox.Activity;
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

    public function initialize() {
        DataField.initialize();

        _distanceMeters = null;
        _hasLocation = false;
        _status = "WAIT GPS";
        _lastSendEpoch = 0;
        _requestInFlight = false;
        _aheadLabel = "UP --";
        _behindLabel = "DN --";
    }

    public function compute(info as Activity.Info) as Void {
        _distanceMeters = info.elapsedDistance;
        _hasLocation = info.currentLocation != null;

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
            "userId" => GarminTrakkerConfig.USER_ID,
            "latitude" => position[0],
            "longitude" => position[1],
            "elapsedDistanceMeters" => elapsedDistance,
            "recordedAtEpoch" => now
        };

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + GarminTrakkerConfig.DEVICE_TOKEN
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        _requestInFlight = true;
        _lastSendEpoch = now;
        _status = "SENDING";

        try {
            Communications.makeWebRequest(
                GarminTrakkerConfig.API_URL,
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

        return prefix + " " + name + " " + formatDelta(deltaMeters);
    }

    private function formatDelta(deltaMeters as Number) as String {
        if (deltaMeters >= 1000) {
            return (deltaMeters / 1000.0f).format("%.1f") + "km";
        }

        return deltaMeters.format("%d") + "m";
    }
}
