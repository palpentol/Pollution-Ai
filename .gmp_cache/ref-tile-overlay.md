# Add a Custom Tile or Image Overlay to a Map

You can display custom content tied to geographical coordinates on a Google Map
so that the content moves and scales when the user drags or zooms the map. The
Maps JavaScript API provides two primary mechanisms for adding custom overlays:

1.  **Custom Overlays (`google.maps.OverlayView`)**: Best for anchoring custom
    DOM elements, single images bounded by specific `LatLngBounds`, or
    interactive popups to the map.
2.  **Custom Tile Overlays (`google.maps.ImageMapType` or
    `google.maps.MapType`)**: Best for rendering grid-based tile layers on top
    of the base map across various zoom levels.

## Prerequisites

Before adding a custom overlay, ensure you have an initialized `google.maps.Map`
instance on your web page.

--------------------------------------------------------------------------------

## Method 1: Create a Custom Overlay (`OverlayView`)

The `google.maps.OverlayView` class is a base class that provides lifecycle
methods (`onAdd()`, `draw()`, and `onRemove()`) and projection utilities to
translate between screen pixel coordinates and geographical `LatLng` locations.

### Lifecycle Implementation Steps

1.  **Subclass `google.maps.OverlayView`**: Create a class that extends
    `google.maps.OverlayView` and initialize your bounds, image URL, or custom
    DOM content in the constructor.
2.  **Implement `onAdd()`**: Called when the map is ready for the overlay to be
    attached. Create your DOM elements here and append them to one of the map's
    panes (`MapPanes`).
3.  **Implement `draw()`**: Called when the object is first displayed and
    whenever the map zooms or pans. Use
    `this.getProjection().fromLatLngToDivPixel()` to convert geographical
    coordinates into pixel coordinates and position/resize your DOM element.
4.  **Implement `onRemove()`**: Called automatically when you set the overlay's
    map property to `null`. Clean up and remove your DOM elements here to
    prevent memory leaks.

### Understanding Map Panes (`MapPanes`)

When implementing `onAdd()`, you attach your DOM element to one of five panes
returned by `this.getPanes()`, stacked from bottom to top:

*   `mapPane` (Pane 0): Lowest pane, above the base tiles. Does not receive DOM
    events.
*   `overlayLayer` (Pane 1): Contains polylines, polygons, ground overlays, and
    tile layer overlays. Does not receive DOM events.
*   `markerLayer` (Pane 2): Contains markers. Does not receive DOM events.
*   `overlayMouseTarget` (Pane 3): Contains elements that receive DOM mouse
    events.
*   `floatPane` (Pane 4): Contains info windows; sits above all map overlays and
    receives DOM events.

### Complete Custom Overlay Example (TypeScript / JavaScript)

The following example creates a `USGSOverlay` class that stretches an image
across a specific `LatLngBounds` and includes methods to toggle its visibility
or detach it from the map's DOM.

#### TypeScript

```typescript
function initMap(): void {
  const map = new google.maps.Map(
    document.getElementById("map") as HTMLElement,
    {
      zoom: 11,
      center: { lat: 62.323907, lng: -150.109291 },
      mapTypeId: "satellite",
      internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
    }
  );

  const bounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(62.281819, -150.287132),
    new google.maps.LatLng(62.400471, -150.005608)
  );

  const image =
    "https://developers.google.com/maps/documentation/javascript/examples/full/images/talkeetna.png";

  /**
   * The custom USGSOverlay object contains the USGS image,
   * the bounds of the image, and a reference to the map.
   */
  class USGSOverlay extends google.maps.OverlayView {
    private bounds: google.maps.LatLngBounds;
    private image: string;
    private div?: HTMLElement;

    constructor(bounds: google.maps.LatLngBounds, image: string) {
      super();
      this.bounds = bounds;
      this.image = image;
    }

    /**
     * onAdd is called when the map's panes are ready and the overlay has been
     * added to the map.
     */
    onAdd() {
      this.div = document.createElement("div");
      this.div.style.borderStyle = "none";
      this.div.style.borderWidth = "0px";
      this.div.style.position = "absolute";

      // Create the img element and attach it to the div.
      const img = document.createElement("img");
      img.src = this.image;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.position = "absolute";
      this.div.appendChild(img);

      // Add the element to the "overlayLayer" pane.
      const panes = this.getPanes()!;
      panes.overlayLayer.appendChild(this.div);
    }

    draw() {
      // Retrieve the projection from the overlay to convert LatLng to pixels.
      const overlayProjection = this.getProjection();

      const sw = overlayProjection.fromLatLngToDivPixel(
        this.bounds.getSouthWest()
      )!;
      const ne = overlayProjection.fromLatLngToDivPixel(
        this.bounds.getNorthEast()
      )!;

      // Resize the image's div to fit the indicated dimensions.
      if (this.div) {
        this.div.style.left = sw.x + "px";
        this.div.style.top = ne.y + "px";
        this.div.style.width = ne.x - sw.x + "px";
        this.div.style.height = sw.y - ne.y + "px";
      }
    }

    /**
     * The onRemove() method will be called automatically from the API if
     * we ever set the overlay's map property to 'null'.
     */
    onRemove() {
      if (this.div) {
        (this.div.parentNode as HTMLElement).removeChild(this.div);
        delete this.div;
      }
    }

    hide() {
      if (this.div) {
        this.div.style.visibility = "hidden";
      }
    }

    show() {
      if (this.div) {
        this.div.style.visibility = "visible";
      }
    }

    toggle() {
      if (this.div) {
        if (this.div.style.visibility === "hidden") {
          this.show();
        } else {
          this.hide();
        }
      }
    }

    toggleDOM(map: google.maps.Map) {
      if (this.getMap()) {
        this.setMap(null);
      } else {
        this.setMap(map);
      }
    }
  }

  const overlay: USGSOverlay = new USGSOverlay(bounds, image);
  overlay.setMap(map);

  // Add UI button controls to toggle visibility and DOM attachment
  const toggleButton = document.createElement("button");
  toggleButton.textContent = "Toggle";
  toggleButton.classList.add("custom-map-control-button");

  const toggleDOMButton = document.createElement("button");
  toggleDOMButton.textContent = "Toggle DOM Attachment";
  toggleDOMButton.classList.add("custom-map-control-button");

  toggleButton.addEventListener("click", () => {
    overlay.toggle();
  });

  toggleDOMButton.addEventListener("click", () => {
    overlay.toggleDOM(map);
  });

  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(toggleDOMButton);
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(toggleButton);
}

declare global {
  interface Window {
    initMap: () => void;
  }
}
window.initMap = initMap;
export {};
```

#### JavaScript

```javascript
function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 11,
    center: { lat: 62.323907, lng: -150.109291 },
    mapTypeId: "satellite",
    internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
  });

  const bounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(62.281819, -150.287132),
    new google.maps.LatLng(62.400471, -150.005608)
  );

  const image =
    "https://developers.google.com/maps/documentation/javascript/examples/full/images/talkeetna.png";

  class USGSOverlay extends google.maps.OverlayView {
    bounds;
    image;
    div;

    constructor(bounds, image) {
      super();
      this.bounds = bounds;
      this.image = image;
    }

    onAdd() {
      this.div = document.createElement("div");
      this.div.style.borderStyle = "none";
      this.div.style.borderWidth = "0px";
      this.div.style.position = "absolute";

      const img = document.createElement("img");
      img.src = this.image;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.position = "absolute";
      this.div.appendChild(img);

      const panes = this.getPanes();
      panes.overlayLayer.appendChild(this.div);
    }

    draw() {
      const overlayProjection = this.getProjection();
      const sw = overlayProjection.fromLatLngToDivPixel(
        this.bounds.getSouthWest()
      );
      const ne = overlayProjection.fromLatLngToDivPixel(
        this.bounds.getNorthEast()
      );

      if (this.div) {
        this.div.style.left = sw.x + "px";
        this.div.style.top = ne.y + "px";
        this.div.style.width = ne.x - sw.x + "px";
        this.div.style.height = sw.y - ne.y + "px";
      }
    }

    onRemove() {
      if (this.div) {
        this.div.parentNode.removeChild(this.div);
        delete this.div;
      }
    }

    hide() {
      if (this.div) {
        this.div.style.visibility = "hidden";
      }
    }

    show() {
      if (this.div) {
        this.div.style.visibility = "visible";
      }
    }

    toggle() {
      if (this.div) {
        if (this.div.style.visibility === "hidden") {
          this.show();
        } else {
          this.hide();
        }
      }
    }

    toggleDOM(map) {
      if (this.getMap()) {
        this.setMap(null);
      } else {
        this.setMap(map);
      }
    }
  }

  const overlay = new USGSOverlay(bounds, image);
  overlay.setMap(map);

  const toggleButton = document.createElement("button");
  toggleButton.textContent = "Toggle";
  toggleButton.classList.add("custom-map-control-button");

  const toggleDOMButton = document.createElement("button");
  toggleDOMButton.textContent = "Toggle DOM Attachment";
  toggleDOMButton.classList.add("custom-map-control-button");

  toggleButton.addEventListener("click", () => {
    overlay.toggle();
  });

  toggleDOMButton.addEventListener("click", () => {
    overlay.toggleDOM(map);
  });

  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(toggleDOMButton);
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(toggleButton);
}

window.initMap = initMap;
```

--------------------------------------------------------------------------------

## Method 2: Add a Custom Tile Overlay (`overlayMapTypes`)

If your custom overlay consists of map tiles indexed by `(x, y)` coordinates and
`zoom` levels, push an `ImageMapType` or custom `MapType` implementation into
`map.overlayMapTypes`. All overlay map types render on top of the base map
tiles.

### Option A: Image Tile Overlay (`google.maps.ImageMapType`)

Use `google.maps.ImageMapType` when you have pre-rendered raster image tiles
hosted on a server.

Source:
https://github.com/googlemaps/js-samples/blob/HEAD/samples/maptype-image-overlay/index.ts?utm_campaign=gmp_git_agentskills_v1

```typescript
function initMap(): void {
  const map = new google.maps.Map(
    document.getElementById("map") as HTMLElement,
    {
      zoom: 18,
      center: { lat: 37.783, lng: -122.403 },
      internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
    }
  );

  // Define tile coordinate bounds for each supported zoom level
  const bounds: Record<number, [[number, number], [number, number]]> = {
    17: [
      [20969, 20970],
      [50657, 50658],
    ],
    18: [
      [41939, 41940],
      [101315, 101317],
    ],
    19: [
      [83878, 83881],
      [202631, 202634],
    ],
    20: [
      [167757, 167763],
      [405263, 405269],
    ],
  };

  const imageMapType = new google.maps.ImageMapType({
    getTileUrl: function (coord, zoom) {
      if (
        zoom < 17 ||
        zoom > 20 ||
        bounds[zoom][0][0] > coord.x ||
        coord.x > bounds[zoom][0][1] ||
        bounds[zoom][1][0] > coord.y ||
        coord.y > bounds[zoom][1][1]
      ) {
        return "";
      }

      return [
        "https://www.gstatic.com/io2010maps/tiles/5/L2_",
        zoom,
        "_",
        coord.x,
        "_",
        coord.y,
        ".png",
      ].join("");
    },
    tileSize: new google.maps.Size(256, 256),
  });

  // Push the custom tile layer onto the map's overlayMapTypes stack
  map.overlayMapTypes.push(imageMapType);
}
```

### Option B: DOM Element Tile Overlay (`google.maps.MapType`)

Implement the `google.maps.MapType` interface directly if you need to generate
custom HTML/DOM elements for each tile via `getTile()`.

Source:
https://github.com/googlemaps/js-samples/blob/HEAD/samples/maptype-overlay/index.ts?utm_campaign=gmp_git_agentskills_v1

```typescript
class CoordMapType implements google.maps.MapType {
  tileSize: google.maps.Size;
  alt: string | null = null;
  maxZoom: number = 17;
  minZoom: number = 0;
  name: string | null = null;
  projection: google.maps.Projection | null = null;
  radius: number = 6378137;

  constructor(tileSize: google.maps.Size) {
    this.tileSize = tileSize;
  }

  getTile(
    coord: google.maps.Point,
    zoom: number,
    ownerDocument: Document
  ): HTMLElement {
    const div = ownerDocument.createElement("div");

    div.innerHTML = String(coord);
    div.style.width = this.tileSize.width + "px";
    div.style.height = this.tileSize.height + "px";
    div.style.fontSize = "10";
    div.style.borderStyle = "solid";
    div.style.borderWidth = "1px";
    div.style.borderColor = "#AAAAAA";
    return div;
  }

  releaseTile(tile: Element): void {}
}

function initMap(): void {
  const map = new google.maps.Map(
    document.getElementById("map") as HTMLElement,
    {
      zoom: 10,
      center: { lat: 41.85, lng: -87.65 },
      internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
    }
  );

  // Insert this overlay map type as the first overlay map type at position 0.
  const coordMapType = new CoordMapType(new google.maps.Size(256, 256));
  map.overlayMapTypes.insertAt(0, coordMapType);
}
```

--------------------------------------------------------------------------------

## Required HTML & CSS Structure

Ensure your map container `<div>` has an explicit height set in CSS so the map
and its overlays render visibly.

### CSS (`style.css`)

```css
/* Always set the map height explicitly to define the size of the div element */
#map {
  height: 100%;
}

/* Optional: Makes the sample page fill the window. */
html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
}

.custom-map-control-button {
  background-color: #fff;
  border: 0;
  border-radius: 2px;
  box-shadow: 0 1px 4px -1px rgba(0, 0, 0, 0.3);
  margin: 10px;
  padding: 0 0.5em;
  font: 400 18px Roboto, Arial, sans-serif;
  overflow: hidden;
  height: 40px;
  cursor: pointer;
}
.custom-map-control-button:hover {
  background: rgb(235, 235, 235);
}
```

### HTML (`index.html`)

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Custom Overlays</title>
    <link rel="stylesheet" type="text/css" href="./style.css" />
    <script type="module" src="./index.js"></script>
  </head>
  <body>
    <div id="map"></div>

    <script
      src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&callback=initMap&v=weekly"
      defer
    ></script>
  </body>
</html>
```
