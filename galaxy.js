const starsVertexShaderSource = `
	precision mediump float;

	const vec4 CAMERA_SPACE_UP = vec4(0.0, 1.0, 0.0, 0.0);
	
	attribute vec4 starPosition;
	attribute vec4 starColor;
	attribute float starRadius;
	attribute float timeTranslation;

	uniform float time;
	uniform float cameraResolutionHeight;

	uniform mat4 objectToWorld;
	uniform mat4 worldToCamera;
	uniform mat4 projection;

	varying lowp vec4 vStarColor;

	void main() {
		vec4 cameraSpaceStarPosition = worldToCamera * objectToWorld * starPosition;
		vec4 pointOnSurface = cameraSpaceStarPosition + CAMERA_SPACE_UP * starRadius;
		vec4 projectedStarCenter = projection * cameraSpaceStarPosition;
		vec4 projectedSurfacePoint = projection * pointOnSurface;

		gl_Position = projectedStarCenter;
		projectedStarCenter *= 1.0 / projectedStarCenter.w;
		projectedSurfacePoint *= 1.0 / projectedSurfacePoint.w;
		
		float flickering = sin(time + timeTranslation) / 10.0;
		float radius = distance(projectedStarCenter, projectedSurfacePoint) * cameraResolutionHeight;
		vStarColor = starColor + vec4(flickering, flickering, flickering, 0.0);
		gl_PointSize = (2.0 + flickering * 1.5) * radius;
	}
`;

const starsFragmentShaderSource = `
	precision lowp float;

	varying lowp vec4 vStarColor;

	void main() {
		float distance = 2.0 * distance(vec2(0.5, 0.5), gl_PointCoord);

		if (distance > 1.0) {
			discard;
		}

		if (distance < 0.35) {
			gl_FragColor = vStarColor;
		}

		else {
			gl_FragColor = clamp(vStarColor * (1.0 - distance * distance), 0.0, 1.0);
		}
	}
`;

const CANVAS = document.querySelector('#canvas');
const GL = canvas.getContext('webgl');
const SCALE_FACTOR = 400.0;
const CAM_X = 0.0;
const CAM_Y = 0.0;
const CAM_Z = 0.0;
const CAM_LOOK_X = 0.0;
const CAM_LOOK_Y = 0.0;
const CAM_LOOK_Z = CAM_Z - 1.0;
const CAM_FOV = Math.PI / 2.0;
const CAM_FAR = 10.0 * SCALE_FACTOR;
const CAM_MOVE_SPEED = 20.0 * (SCALE_FACTOR / 400.0);
const TAILS = 6;
const STARS = 5555;
const FLOAT_BYTES = 4;
const STAR_VERTEX_SIZE = 10;
const STAR_VERTEX_POSITION_SIZE = 4;
const STAR_VERTEX_COLOR_SIZE = 4;
const TAIL_STAR_ROTATION = (3.0 * Math.PI) / 2.0;
const MIN_STAR_RADIUS = 0.5;
const MAX_STAR_RADIUS = MIN_STAR_RADIUS + 0.75 * MIN_STAR_RADIUS;
const FLICKERING_PERIOD = 2.0 * Math.PI;
const FLICKERING_SPEED = Math.PI;
const GALAXY_ROTATION_SPEED = 0.2;

class Shader {
	constructor(vertexSource, fragmentSource) {
		this.compileShader(vertexSource, fragmentSource);
	}

	compileShaderSource(type, source) {
		let shader = GL.createShader(type);
		GL.shaderSource(shader, source);
		GL.compileShader(shader);
		if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
			alert('Could not compile shader: ' + GL.getShaderInfoLog(shader));
			GL.deleteShader(shader);
			return null;
		}

		return shader;
	}

	compileShader(vertexSource, fragmentSource) {
		let vertexShader = this.compileShaderSource(GL.VERTEX_SHADER, vertexSource);
		let fragmentShader = this.compileShaderSource(GL.FRAGMENT_SHADER, fragmentSource);

		if (vertexShader === null || fragmentShader === null) {
			return;
		}

		this.shaderProgram = GL.createProgram();
		GL.attachShader(this.shaderProgram, vertexShader);
		GL.attachShader(this.shaderProgram, fragmentShader);
		GL.linkProgram(this.shaderProgram);

		if (!GL.getProgramParameter(this.shaderProgram, GL.LINK_STATUS)) {
			alert('Could not link shader program: ' + GL.getProgramInfoLog(this.shaderProgram));
		}
	}

	bind() {
		GL.useProgram(this.shaderProgram);
	}

	getAttribute(attributeName) {
		return GL.getAttribLocation(this.shaderProgram, attributeName);
	}

	getUniform(uniformName) {
		return GL.getUniformLocation(this.shaderProgram, uniformName);
	}
}

class Camera {
	constructor(position, lookAt, cameraUp, resolutionWidth, resolutionHeight, fov, near, far) {
		this.position = vec4.create();
		this.cameraUp = vec4.create();
		this.resolutionWidth = resolutionWidth;
		this.resolutionHeight = resolutionHeight;

		this.position[0] = position[0];
		this.position[1] = position[1];
		this.position[2] = position[2];
		this.position[3] = 1.0;

		this.cameraUp[0] = cameraUp[0];
		this.cameraUp[1] = cameraUp[1];
		this.cameraUp[2] = cameraUp[2];
		this.cameraUp[3] = 0.0;

		this.initializeTransformations(position, lookAt, cameraUp, resolutionWidth / resolutionHeight, fov, near, far);
	}

	initializeTransformations(position, lookAt, up, aspectRatio, fov, near, far) {
		this.cameraTransform = mat4.create();
		this.projectionMatrix = mat4.create();

		mat4.lookAt(this.cameraTransform, position, lookAt, up);
		mat4.perspective(this.projectionMatrix, fov, aspectRatio, near, far);
	}

	translate(translationVector) {
		let translationMatrix = mat4.create();
		let inverseTM = mat4.create();
		mat4.translate(translationMatrix, translationMatrix, translationVector);
		mat4.invert(inverseTM, translationMatrix);
		mat4.multiply(this.cameraTransform, this.cameraTransform, inverseTM);

		vec4.transformMat4(this.position, this.position, translationMatrix);
	}
}

class StarVertex {
	constructor(position, color, radius, timeTranslation) {
		this.position = position;
		this.color = color;
		this.radius = radius;
		this.timeTranslation = timeTranslation;
	}
}

class Galaxy {
	constructor(stars, tails) {
		this.starsShader = new Shader(starsVertexShaderSource, starsFragmentShaderSource);
		this.objectToWorld = mat4.create();
		this.stars = stars;
		this.tails = tails;
		this.time = 0.0;

		let scaleVector = vec3.create();
		scaleVector[0] = SCALE_FACTOR;
		scaleVector[1] = SCALE_FACTOR;
		scaleVector[2] = SCALE_FACTOR;
		mat4.scale(this.objectToWorld, this.objectToWorld, scaleVector);

		this.vertexBuffer = this.createVertexBuffer(this.createStars());
		this.createAttributeArrays();
	}

	createStars() {
		let stars = [];

		for (let t = 0; t < this.tails; ++t) {
			let tailRotation = t * 2.0 * Math.PI / this.tails + Math.random() / 10.0;
			for (let i = 0; i < this.stars; ++i) {
				let u0 = Math.random();
				let tilt = (2.0 * Math.random() - 1.0) * 0.3;
				let x = Math.pow(u0, 2.0);
				let y = x + tilt;
				let distance = Math.sqrt(x * x + y * y);
				let t = Math.min(distance, 0.95);
				let z = (2.0 * Math.random() - 1.0) / 10.0;
				let pos = vec4.create();
				let color = vec4.create();

				pos[0] = x;
				pos[1] = y;
				pos[2] = z;
				pos[3] = 1.0;

				color[0] = Math.random() * 0.95;
				color[1] = Math.random() * 0.85;
				color[2] = Math.random();
				color[3] = 1.0;

				let rotationAnGLe = TAIL_STAR_ROTATION * distance + Math.PI * Math.random() * (1.0 - Math.sqrt(t)) + tailRotation;
				let rotationMatrix = mat4.create();
				mat4.rotateZ(rotationMatrix, rotationMatrix, -rotationAnGLe);
				vec4.transformMat4(pos, pos, rotationMatrix);

				let radius = MIN_STAR_RADIUS + Math.random() * (MAX_STAR_RADIUS - MIN_STAR_RADIUS);
				let timeTranslation = FLICKERING_PERIOD * Math.random();
				stars.push(new StarVertex(pos, color, radius, timeTranslation));
			}
		}
		console.log('Created galaxy!');

		return stars.map((star) => [
			star.position[0], star.position[1], star.position[2], star.position[3],
			star.color[0], star.color[1], star.color[2], star.color[3],
			star.radius, star.timeTranslation
		]).flat();
	}

	createVertexBuffer(vertices) {
		let vertexBuffer = GL.createBuffer();
		GL.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
		GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(vertices), GL.STATIC_DRAW);
		GL.bindBuffer(GL.ARRAY_BUFFER, null);
		return vertexBuffer;
	}

	createAttributeArrays() {
		GL.bindBuffer(GL.ARRAY_BUFFER, this.vertexBuffer);
		GL.vertexAttribPointer(
			this.starsShader.getAttribute('starPosition'),
			STAR_VERTEX_POSITION_SIZE,
			GL.FLOAT,
			false,
			STAR_VERTEX_SIZE * FLOAT_BYTES,
			0);
		GL.enableVertexAttribArray(this.starsShader.getAttribute('starPosition'));

		GL.vertexAttribPointer(
			this.starsShader.getAttribute('starColor'),
			STAR_VERTEX_COLOR_SIZE,
			GL.FLOAT,
			false,
			STAR_VERTEX_SIZE * FLOAT_BYTES,
			STAR_VERTEX_POSITION_SIZE * FLOAT_BYTES);
		GL.enableVertexAttribArray(this.starsShader.getAttribute('starColor'));

		GL.vertexAttribPointer(
			this.starsShader.getAttribute('starRadius'),
			1,
			GL.FLOAT,
			false,
			STAR_VERTEX_SIZE * FLOAT_BYTES,
			(STAR_VERTEX_POSITION_SIZE + STAR_VERTEX_COLOR_SIZE) * FLOAT_BYTES);
		GL.enableVertexAttribArray(this.starsShader.getAttribute('starRadius'));

		GL.vertexAttribPointer(
			this.starsShader.getAttribute('timeTranslation'),
			1,
			GL.FLOAT,
			false,
			STAR_VERTEX_SIZE * FLOAT_BYTES,
			(STAR_VERTEX_POSITION_SIZE + STAR_VERTEX_COLOR_SIZE + 1) * FLOAT_BYTES);
		GL.enableVertexAttribArray(this.starsShader.getAttribute('timeTranslation'));

		GL.bindBuffer(GL.ARRAY_BUFFER, null);
	}

	update(delta) {
		this.time += delta * FLICKERING_SPEED;
		if (this.time > FLICKERING_PERIOD) {
			this.time -= FLICKERING_PERIOD;
		}

		let rotation = mat4.create();
		mat4.rotateZ(rotation, rotation, delta * GALAXY_ROTATION_SPEED);
		mat4.multiply(this.objectToWorld, this.objectToWorld, rotation);
	}

	draw(camera) {
		this.starsShader.bind();
		GL.bindBuffer(GL.ARRAY_BUFFER, this.vertexBuffer);
		GL.uniform1f(
			this.starsShader.getUniform('time'),
			this.time);
		GL.uniform1f(
			this.starsShader.getUniform('cameraResolutionHeight'),
			camera.resolutionHeight);

		GL.uniformMatrix4fv(
			this.starsShader.getUniform('projection'),
			false,
			camera.projectionMatrix);
		GL.uniformMatrix4fv(
			this.starsShader.getUniform('worldToCamera'),
			false,
			camera.cameraTransform);
		GL.uniformMatrix4fv(
			this.starsShader.getUniform('objectToWorld'),
			false,
			this.objectToWorld);
		GL.drawArrays(GL.POINTS, 0, this.stars * this.tails);
	}
}

function main() {
	if (!GL) {
		alert('Error: Could not create GL context');
		return -1;
	}

	resolutionWidth = GL.canvas.clientWidth;
	resolutionHeight = GL.canvas.clientHeight;

	setupGL();
	let galaxy = new Galaxy(STARS, TAILS);
	let cameraPosition = vec3.create();
	let cameraLookAt = vec3.create();
	let cameraUp = vec3.create();

	cameraPosition[0] = CAM_X;
	cameraPosition[1] = CAM_Y;
	cameraPosition[2] = CAM_Z;

	cameraLookAt[0] = CAM_LOOK_X;
	cameraLookAt[1] = CAM_LOOK_Y;
	cameraLookAt[2] = CAM_LOOK_Z;

	cameraUp[0] = 0.0;
	cameraUp[1] = 1.0;
	cameraUp[2] = 0.0;

	let camera = new Camera(cameraPosition, cameraLookAt, cameraUp,
		resolutionWidth, resolutionHeight, CAM_FOV, 0.01, CAM_FAR);

	render(galaxy, camera);
}

function setupGL() {
	GL.clearColor(0.0, 0.0, 0.0, 1.0);
	GL.enable(GL.BLEND);
	GL.blendFunc(GL.SRC_ALPHA, GL.DST_ALPHA);
	GL.clearDepth(1.0);
	GL.disable(GL.DEPTH_TEST);
}

function render(galaxy, camera) {
	let timeNow = Date.now();
	let timePrev = timeNow;
	let delta = 0.0;
	let cameraMoveDirection = vec3.create();

	function draw() {
		timeNow = Date.now();
		delta = (timeNow - timePrev) / 1000.0;
		timePrev = timeNow;
		galaxy.update(delta);

		cameraMoveDirection[2] = delta * CAM_MOVE_SPEED;
		camera.translate(cameraMoveDirection);

		GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
		galaxy.draw(camera);
		requestAnimationFrame(draw);
	}

	requestAnimationFrame(draw);
}

main();
