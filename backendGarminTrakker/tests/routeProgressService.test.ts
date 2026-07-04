import assert from "assert";
import {
  calculateRouteRank,
  extractRouteLines,
  projectPositionOnRoute,
} from "../src/services/routeProgressService";

const test = (name: string, run: () => void): void => {
  run();
  console.log(`OK ${name}`);
};

const featureCollection = (geometry: Record<string, unknown>) => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry,
    },
  ],
});

test("projects a GPS position onto a LineString", () => {
  const projection = projectPositionOnRoute({
    latitude: 0.0001,
    longitude: 0.005,
    geoJson: featureCollection({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.01, 0],
      ],
    }),
  });

  assert.ok(projection);
  assert.ok(Math.abs(projection.progressMeters - 555.97) < 1);
  assert.ok(Math.abs(projection.routeLengthMeters - 1111.95) < 1);
  assert.ok(Math.abs(projection.progressPercent - 50) < 0.1);
  assert.ok(Math.abs(projection.distanceFromRouteMeters - 11.12) < 1);
  assert.equal(projection.isOffRoute, false);
});

test("marks positions farther than 100 metres as off route", () => {
  const projection = projectPositionOnRoute({
    latitude: 0.002,
    longitude: 0.005,
    geoJson: featureCollection({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.01, 0],
      ],
    }),
  });

  assert.ok(projection);
  assert.ok(projection.distanceFromRouteMeters > 200);
  assert.equal(projection.isOffRoute, true);
});

test("supports MultiLineString without counting gaps between track segments", () => {
  const projection = projectPositionOnRoute({
    latitude: 0,
    longitude: 0.0105,
    geoJson: featureCollection({
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [0.001, 0],
        ],
        [
          [0.01, 0],
          [0.011, 0],
        ],
      ],
    }),
  });

  assert.ok(projection);
  assert.ok(Math.abs(projection.routeLengthMeters - 222.39) < 1);
  assert.ok(Math.abs(projection.progressMeters - 166.79) < 1);
  assert.ok(Math.abs(projection.progressPercent - 75) < 0.1);
});

test("uses previous progress to disambiguate overlapping route segments", () => {
  const geoJson = featureCollection({
    type: "LineString",
    coordinates: [
      [0, 0],
      [0.01, 0],
      [0, 0],
    ],
  });
  const outbound = projectPositionOnRoute({
    latitude: 0,
    longitude: 0.005,
    geoJson,
    preferredProgressMeters: 500,
  });
  const inbound = projectPositionOnRoute({
    latitude: 0,
    longitude: 0.005,
    geoJson,
    preferredProgressMeters: 1700,
  });

  assert.ok(outbound);
  assert.ok(inbound);
  assert.ok(outbound.progressMeters < 600);
  assert.ok(inbound.progressMeters > 1600);
});

test("ignores point features and rejects collections without a route", () => {
  const geoJson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [0, 0],
        },
      },
    ],
  };

  assert.deepEqual(extractRouteLines(geoJson), []);
  assert.equal(
    projectPositionOnRoute({
      latitude: 0,
      longitude: 0,
      geoJson,
    }),
    null,
  );
});

test("calculates rank from fresh route participants and preserves ties", () => {
  assert.deepEqual(calculateRouteRank(5000, [6200, 5000, 4800, 4100]), {
    rank: 2,
    participantCount: 5,
  });
  assert.deepEqual(calculateRouteRank(5000, [Number.NaN, -1, 7000]), {
    rank: 2,
    participantCount: 2,
  });
});
