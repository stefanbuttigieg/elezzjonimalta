declare module "*.geojson?url" {
  const url: string;
  export default url;
}

declare module "*.geojson" {
  const value: GeoJSON.FeatureCollection;
  export default value;
}
