import requests
import geopandas as gpd

# 1. Fetch the official metadata for Vietnam Admin Level 1 from the geoBoundaries API
api_url = "https://www.geoboundaries.org/api/current/gbOpen/VNM/ADM1/"
response = requests.get(api_url).json()

# 2. Extract the direct GeoJSON download link
geojson_url = response["gjDownloadURL"]

# 3. Read and save locally
gdf = gpd.read_file(geojson_url)
gdf.to_file("vietnam_adm1.geojson", driver="GeoJSON")

print("Successfully downloaded and saved vietnam_adm1.geojson!")