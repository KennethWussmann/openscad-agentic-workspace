export const titleCase = (id: string) =>
  id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export const mainTemplate = (name: string, description: string) => `// ${name}
// ${description || 'Describe what this model is for.'}
// Units: millimetres. Z is up, the model sits on the XY plane.

/* [Dimensions] */
// Outer width along X
width = 40; // [5:1:200]
// Outer depth along Y
depth = 30; // [5:1:200]
// Outer height along Z
height = 20; // [2:1:200]
// Radius of the vertical edges
corner_radius = 3; // [0:0.5:20]

/* [Quality] */
// Maximum angle per facet on curves, in degrees
$fa = 4; // [1:1:12]
// Maximum facet length on curves, in mm
$fs = 0.4; // [0.1:0.05:2]

/* [Hidden] */
eps = 0.01;

rounded_block([width, depth, height], corner_radius);

module rounded_block(size, r) {
  if (r <= 0) {
    cube(size);
  } else {
    hull() {
      for (x = [r, size.x - r], y = [r, size.y - r])
        translate([x, y, 0]) cylinder(r = r, h = size.z);
    }
  }
}
`

export const briefTemplate = (name: string, description: string) => `# ${name}

${description || 'One or two sentences on what this is and what it is for.'}

## Requirements

- 

## Key dimensions and constraints

- 

## Parts

- main: 

## Decisions

- 

## Changelog

`
