# [Procedurally generated galaxy in WebGL (click to run!)](https://raw.githack.com/loukoum/galaxy-webgl/master/index.html)

![alt text](https://raw.githubusercontent.com/majesticwizardcqt/galaxy-webgl/master/screenshot.png)

### Description
This is a procedurally generated galaxy rendered in WebGL. The galaxy generation (createStars function) 
as well as the shaders are all included in galaxy.js and I used gl-matrix.js -which I borrowed,
for linear algebra operations. The index.html just initializes a canvas for the webGL context. You can click
the title at the top of the readme to run the project.

### Star generation
To generate the stars first a random point is generated in the y = x line where x ranges in [0, 1) and
then it is tilted by a small random amount at the y-axis. Finally all stars are rotated in the z-axis by
an amount that increases as the distnace from (0, 0) increases. The z value is just a random number that
ranges in [-0.1, 0.1). To generate more stars closer to the center of the galaxy the x component is raised
to a power.

### Rendering
The program is using webGL to render the stars of the galaxy as dots. After generating the stars, a
vertex buffer is created and stored. To simulate depth the dot's pixel size changes depending on the
distance it has from the camera. The dot's pixel size is calculated by taking a point from the star's
surface and projecting it into the screen along with the star's center and then calculate the distance
of the projected center and the projected surface point in the raster space and multiply it by 2. Finally
an area of the fragment is painted as the star's color with full alpha and the rest faints slowly as the 
distance from the center increases to simulate a simple bloom effect.
