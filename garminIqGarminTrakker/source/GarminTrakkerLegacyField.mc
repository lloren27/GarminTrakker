import Toybox.Activity;
import Toybox.Application.Storage;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

class GarminTrakkerLegacyField extends WatchUi.DataField {
    private var _distanceMeters as Float?;
    private var _status as String;
    private var _aheadLabel as String;
    private var _behindLabel as String;
    private var _lastTelemetrySaveEpoch as Number;
    private var _routeProgressMeters as Float?;
    private var _remainingMeters as Float?;
    private var _progressPercent as Float?;
    private var _distanceFromRouteMeters as Float?;
    private var _isOffRoute as Boolean;
    private var _rank as Number?;
    private var _participantCount as Number?;
    private var _lastSyncEpoch as Number;

    public function initialize() {
        DataField.initialize();

        _distanceMeters = null;
        _status = "PREP CODE";
        _aheadLabel = "UP --";
        _behindLabel = "DN --";
        _lastTelemetrySaveEpoch = 0;
        _routeProgressMeters = null;
        _remainingMeters = null;
        _progressPercent = null;
        _distanceFromRouteMeters = null;
        _isOffRoute = false;
        _rank = null;
        _participantCount = null;
        _lastSyncEpoch = 0;

        ensureDeviceId();
        refreshStoredState();
    }

    public function compute(info as Activity.Info) as Void {
        _distanceMeters = info.elapsedDistance;
        refreshStoredState();

        var location = getBestLocation(info);
        var now = Time.now().value();
        if (
            location != null &&
            (now - _lastTelemetrySaveEpoch) >= GarminTrakkerConfig.SEND_INTERVAL_SECONDS
        ) {
            saveLatestTelemetry(info, location, now);
            _lastTelemetrySaveEpoch = now;
        }
    }

    public function onUpdate(dc as Graphics.Dc) as Void {
        var bgColor = getBackgroundColor();
        var fgColor = bgColor == Graphics.COLOR_WHITE
            ? Graphics.COLOR_BLACK
            : Graphics.COLOR_WHITE;
        var width = dc.getWidth();
        var height = dc.getHeight();
        var centerX = width / 2;

        dc.setColor(fgColor, bgColor);
        dc.clear();
        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, 8, Graphics.FONT_SMALL, "GarminTrakker 530", Graphics.TEXT_JUSTIFY_CENTER);

        var token = Storage.getValue("deviceToken");
        if (!(token instanceof String)) {
            drawPairingView(dc, centerX, height, fgColor);
            return;
        }

        dc.drawText(centerX, 34, Graphics.FONT_XTINY, formatRanking(), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(centerX, 58, Graphics.FONT_SMALL, _aheadLabel, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(
            centerX,
            height / 2,
            Graphics.FONT_NUMBER_MEDIUM,
            formatDistance(
                _routeProgressMeters != null ? _routeProgressMeters : _distanceMeters
            ),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER
        );
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

    private function ensureDeviceId() as Void {
        var storedDeviceId = Storage.getValue("deviceId");
        if (storedDeviceId instanceof String && storedDeviceId.length() > 0) {
            return;
        }

        var identifier = System.getDeviceSettings().uniqueIdentifier;
        Storage.setValue(
            "deviceId",
            identifier instanceof String ? identifier : "garmintrakker-edge530"
        );
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

    private function saveLatestTelemetry(info as Activity.Info, location as Position.Location, now as Number) as Void {
        var elapsedDistance = info.elapsedDistance;
        if (elapsedDistance == null) {
            return;
        }

        var position = location.toDegrees();
        var telemetry = {
            "latitude" => position[0],
            "longitude" => position[1],
            "elapsedDistanceMeters" => elapsedDistance,
            "recordedAtEpoch" => now
        };

        if (info.averageSpeed != null) {
            telemetry["averageSpeedMps"] = info.averageSpeed;
        }
        if (info.currentSpeed != null) {
            telemetry["currentSpeedMps"] = info.currentSpeed;
        }
        if (info.timerTime != null) {
            telemetry["timerTimeSeconds"] = info.timerTime / 1000.0f;
        }

        Storage.setValue("latestTelemetry", telemetry);
    }

    private function refreshStoredState() as Void {
        var storedStatus = Storage.getValue("backgroundStatus");
        if (storedStatus instanceof String) {
            _status = storedStatus;
        }

        var summary = Storage.getValue("liveSummary");
        if (summary instanceof Dictionary) {
            _aheadLabel = formatPeer("UP", summary["ahead"]);
            _behindLabel = formatPeer("DN", summary["behind"]);
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
        } else {
            clearLiveSummary();
        }
    }

    private function drawPairingView(
        dc as Graphics.Dc,
        centerX as Number,
        height as Number,
        fgColor as Number
    ) as Void {
        var pairingCode = Storage.getValue("pairingCode");
        var codeLabel = pairingCode instanceof String ? pairingCode : "....";

        dc.setColor(fgColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, 48, Graphics.FONT_SMALL, "VINCULAR EN WEB", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(
            centerX,
            height / 2,
            Graphics.FONT_NUMBER_MEDIUM,
            codeLabel,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER
        );
        dc.drawText(centerX, height - 52, Graphics.FONT_SMALL, _status, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(centerX, height - 28, Graphics.FONT_XTINY, "SYNC MAX 5 MIN", Graphics.TEXT_JUSTIFY_CENTER);
    }

    private function formatDistance(distanceMeters as Float?) as String {
        if (distanceMeters == null) {
            return "--.- km";
        }

        return (distanceMeters / 1000.0f).format("%.1f") + " km";
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

    private function clearLiveSummary() as Void {
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
            return "SYNC <1m / MAX 5m";
        }

        return "SYNC " + (ageSeconds / 60).format("%d") + "m / MAX 5m";
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

        var shortName = name.length() > 8 ? name.substring(0, 8) : name;
        var label = prefix + " " + shortName + " " + formatDelta(deltaMeters);
        var gapSeconds = peer["gapSeconds"];
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
