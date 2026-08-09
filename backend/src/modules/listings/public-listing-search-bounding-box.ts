import type { DeploymentRegion } from "../../config/env.js";

export interface RadiusBoundingBox {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

export interface DeploymentRegionScope {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

const deploymentRegionScopes: Readonly<Record<DeploymentRegion, DeploymentRegionScope>> = Object.freeze({
  HO_CHI_MINH_CITY_VN: Object.freeze({
    south: Number("10.633333333333333"),
    north: Number("11.166666666666667"),
    west: Number("106.36666666666666"),
    east: Number("106.93333333333334")
  })
});

export function isWithinDeploymentRegionScope(
  deploymentRegion: DeploymentRegion,
  centerLat: number,
  centerLng: number
): boolean {
  const scope = deploymentRegionScopes[deploymentRegion];
  return (
    Number.isFinite(centerLat) &&
    Number.isFinite(centerLng) &&
    centerLat >= scope.south &&
    centerLat <= scope.north &&
    centerLng >= scope.west &&
    centerLng <= scope.east
  );
}

export function calculateRadiusBoundingBox(centerLat: number, centerLng: number, radiusKm: number): RadiusBoundingBox {
  const centerLatitudeRadians = (centerLat * Math.PI) / 180;
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / (111.32 * Math.cos(centerLatitudeRadians));
  const boundingBox = {
    south: centerLat - latitudeDelta,
    north: centerLat + latitudeDelta,
    west: centerLng - longitudeDelta,
    east: centerLng + longitudeDelta
  };

  if (Object.values(boundingBox).some((value) => !Number.isFinite(value))) {
    throw new Error("Radius bounding box calculation produced a non-finite value.");
  }

  return Object.freeze(boundingBox);
}
