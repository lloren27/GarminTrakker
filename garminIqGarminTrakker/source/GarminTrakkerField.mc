import Toybox.Activity;
import Toybox.Application.Storage;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

class GarminTrakkerLiveField extends WatchUi.DataField {
    private var _distanceMeters as Float?;
    private var _hasLocation as Boolean;
    private var _status as String;
    private var _lastSendEpoch as Number;
    private var _requestInFlight as Boolean;
    private var _aheadLabel as String;
    private var _behindLabel as String;
    private var _routeProgressMeters as Float?;
    private var _remainingMeters as Float?;
    private var _progressPercent as Float?;
    private var _distanceFromRouteMeters as Float?;
    private var _isOffRoute as Boolean;
    private var _rank as Number?;
    private var _participantCount as Number?;
    private var _lastSyncEpoch as Number;
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
        _routeProgressMeters = null;
        _remainingMeters = null;
        _progressPercent = null;
        _distanceFromRouteMeters = null;
        _isOffRoute = false;
        _rank = null;
        _participantCount = null;
        _lastSyncEpoch = 0;
        _deviceId = getDeviceId();
        _deviceToken = getStoredDeviceToken();
        _pairingCode = null;
        _lastPairingRequestEpoch = 0;
        refreshStoredSummary();

        if (_deviceToken == null) {
            _status = "PAIRING";
        }
    }

    public function compute(info as Activity.Info) as Void {
        _distanceMeters = info.elapsedDistance;
        var location = getBestLocation(info);
        _hasLocation = location != null;

        if (_deviceToken == null) {
            handlePairing();
            return;
        }

        if (location != null) {
            _status = "READY";
            sendLocationIfDue(info, location);
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

        var distanceLabel = formatDistance(
            _routeProgressMeters != null ? _routeProgressMeters : _distanceMeters
        );
        dc.drawText(centerX, 34, Graphics.FONT_XTINY, formatRanking(), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(centerX, 58, Graphics.FONT_SMALL, _aheadLabel, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(centerX, height / 2, Graphics.FONT_NUMBER_MEDIUM, distanceLabel, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(centerX, height - 78, Graphics.FONT_SMALL, _behindLabel, Graphics.TEXT_JUSTIFY_CENTER);

        if (_isOffRoute) {
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
        }
        dc.drawText(
            centerX,
            height - 50,
            Graphics.FONT_SMALL,
            formatRouteStatus(),
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(
            centerX,
            height - 26,
            Graphics.FONT_XTINY,
            formatSyncStatus(),
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
            clearLiveSummary();
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

    private function getBestLocation(info as Activity.Info) as Position.Location? {
        if (info.currentLocation != null) {
            return info.currentLocation;
        }

        try {
            var positionInfo = Position.getInfo();
            if (positionInfo != null && positionInfo.position != null) {
                return positionInfo.position;
            }
        } catch (ex) {
            System.println("GarminTrakker position fallback error: " + ex.toString());
        }

        return null;
    }

    private function sendLocationIfDue(info as Activity.Info, location as Position.Location) as Void {
        if (_requestInFlight) {
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
            clearLiveSummary();
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
            applyLiveSummary(data);
        }

        _status = "SYNC OK";
    }

    private function updatePeerLabels(data as Dictionary) as Void {
        var ahead = data["ahead"];
        var behind = data["behind"];

        _aheadLabel = formatPeer("UP", ahead);
        _behindLabel = formatPeer("DN", behind);
    }

    private function applyLiveSummary(data as Dictionary) as Void {
        updatePeerLabels(data);

        _routeProgressMeters = getFloat(data["progressMeters"]);
        _remainingMeters = getFloat(data["remainingMeters"]);
        _progressPercent = getFloat(data["progressPercent"]);
        _distanceFromRouteMeters = getFloat(data["distanceFromRouteMeters"]);
        _rank = getNumber(data["rank"]);
        _participantCount = getNumber(data["participantCount"]);

        var offRoute = data["isOffRoute"];
        _isOffRoute = offRoute instanceof Boolean ? offRoute : false;
        _lastSyncEpoch = Time.now().value();

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
            "syncedAtEpoch" => _lastSyncEpoch
        });
    }

    private function refreshStoredSummary() as Void {
        var summary = Storage.getValue("liveSummary");
        if (!(summary instanceof Dictionary)) {
            return;
        }

        updatePeerLabels(summary);
        _routeProgressMeters = getFloat(summary["progressMeters"]);
        _remainingMeters = getFloat(summary["remainingMeters"]);
        _progressPercent = getFloat(summary["progressPercent"]);
        _distanceFromRouteMeters = getFloat(summary["distanceFromRouteMeters"]);
        _rank = getNumber(summary["rank"]);
        _participantCount = getNumber(summary["participantCount"]);

        var offRoute = summary["isOffRoute"];
        _isOffRoute = offRoute instanceof Boolean ? offRoute : false;

        var syncedAt = summary["syncedAtEpoch"];
        if (syncedAt instanceof Number) {
            _lastSyncEpoch = syncedAt;
        }
    }

    private function clearLiveSummary() as Void {
        Storage.deleteValue("liveSummary");
        _routeProgressMeters = null;
        _remainingMeters = null;
        _progressPercent = null;
        _distanceFromRouteMeters = null;
        _isOffRoute = false;
        _rank = null;
        _participantCount = null;
        _lastSyncEpoch = 0;
        _aheadLabel = "UP --";
        _behindLabel = "DN --";
    }

    private function getFloat(value as Object?) as Float? {
        if (value instanceof Float) {
            return value;
        }
        if (value instanceof Number) {
            return value.toFloat();
        }

        return null;
    }

    private function getNumber(value as Object?) as Number? {
        if (value instanceof Number) {
            return value;
        }
        if (value instanceof Float) {
            return value.toNumber();
        }

        return null;
    }

    private function formatRanking() as String {
        var rankLabel = "P --/--";
        if (_rank != null && _participantCount != null) {
            rankLabel = "P " + _rank.format("%d") + "/" + _participantCount.format("%d");
        }

        if (_progressPercent != null) {
            rankLabel += " | " + _progressPercent.format("%.0f") + "%";
        }

        return rankLabel;
    }

    private function formatRouteStatus() as String {
        if (_isOffRoute) {
            if (_distanceFromRouteMeters != null) {
                return "OFF ROUTE " + _distanceFromRouteMeters.format("%.0f") + "m";
            }
            return "OFF ROUTE";
        }

        if (_remainingMeters != null) {
            return "REST " + formatCompactDistance(_remainingMeters);
        }

        return "WAIT ROUTE";
    }

    private function formatSyncStatus() as String {
        if (_lastSyncEpoch <= 0) {
            return _status;
        }

        var ageSeconds = Time.now().value() - _lastSyncEpoch;
        if (ageSeconds < 60) {
            return "LIVE " + ageSeconds.format("%d") + "s";
        }

        return "LIVE " + (ageSeconds / 60).format("%d") + "m";
    }

    private function formatCompactDistance(distanceMeters as Float) as String {
        if (distanceMeters >= 1000.0f) {
            return (distanceMeters / 1000.0f).format("%.1f") + "km";
        }

        return distanceMeters.format("%.0f") + "m";
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
        var shortName = name.length() > 8 ? name.substring(0, 8) : name;
        var label = prefix + " " + shortName + " " + formatDelta(deltaMeters);

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
