/*jshint esversion: 6 */

// Copyright 2017 Intel Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// True if the mouse is currently pressed down.
var mouseDown = false;
// Last position of the mouse when it was pressed down.
var lastMousePositionX = 0;
var lastMousePositionY = 0;
// Rotation of the model in degrees.
// https://en.wikipedia.org/wiki/Yaw_%28rotation%29
var yaw = 0;
var pitch = 0;

// Use this for displaying errors to the user. More details should be put into
// `console.error` messages.
function showErrorToUser(message) {
    var div = document.getElementById("errormessages");
    div.innerHTML += message + "</br>";
}

function handleError(error) {
    console.error(error.name + ": " + error.message);
    showErrorToUser("Error " + error.name + ": " + error.message);
}

function handleMouseDown(event) {
    mouseDown = true;
    lastMousePositionX = event.clientX;
    lastMousePositionY = event.clientY;
}

function handleMouseUp(event) {
    mouseDown = false;
    lastMousePositionX = event.clientX;
    lastMousePositionY = event.clientY;
}

// Limit the `value` to be between `min` and `max`.
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function handleMouseMove(event) {
    if (!mouseDown) {
        return;
    }
    yaw = clamp(yaw - (event.clientX - lastMousePositionX), -120, 120);
    pitch = clamp(pitch + (event.clientY - lastMousePositionY), -80, 80);
    lastMousePositionX = event.clientX;
    lastMousePositionY = event.clientY;
}

function getMvpMatrix(width, height) {
    var model = new mat4.create();
    mat4.translate(model, model, vec3.fromValues(0, 0, 0.5));
    mat4.rotateX(model, model, glMatrix.toRadian(pitch));
    mat4.rotateY(model, model, glMatrix.toRadian(yaw));
    mat4.translate(model, model, vec3.fromValues(0, 0, -0.5));

    var view = new mat4.create();
    mat4.lookAt(view,
        vec3.fromValues(0, 0, 0),   // eye
        vec3.fromValues(0, 0, 1),   // target
        vec3.fromValues(0, -1, 0));  // up

    var aspect = width / height;
    var projection = new mat4.create();
    mat4.perspective(projection, glMatrix.toRadian(60.0), aspect, 0.1, 20.0);

    var mv = mat4.create();
    mat4.multiply(mv, view, model);

    var mvp = mat4.create();
    mat4.multiply(mvp, projection, mv);
    return mvp;
}

// Compile the shader from `source` and return a reference to it.
function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    var msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw {
        name: "ShaderCompilationError",
        message: msg,
    };
}

// Compile shaders, activate the shader program and return a reference to it.
// The shaders are defined in the html file.
function setupProgram(gl) {
    var source = document.getElementById("vertexshader").text;
    var vertexShader = createShader(gl, gl.VERTEX_SHADER, source);
    source = document.getElementById("fragmentshader").text;
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, source);

    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        console.log("GLSL program compiled.");
        gl.useProgram(program);
        return program;
    }
    var msg = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw {
        name: "ShaderLinkingError",
        message: msg,
    };
}

// Create textures into which the camera output will be stored.
function setupTextures(gl, program) {
    var shaderColorTexture = gl.getUniformLocation(program, "u_color_texture");
    gl.uniform1i(shaderColorTexture, 0);

    var colorStreamTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorStreamTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    var shaderDepthTexture = gl.getUniformLocation(program, "u_depth_texture");
    gl.uniform1i(shaderDepthTexture, 1);
    var depthStreamTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthStreamTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return {
        colorStreamTexture: colorStreamTexture,
        depthStreamTexture: depthStreamTexture,
    };
}

// Find the Realsense streams and select the RGB and Depth streams.
//
// devices: Result from `MediaDevices.enumerateDevices()`.
//
// Return a string with the camera name.
function activateDepthCamera(devices) {
    var videoDevices = devices
        .filter((device) => device.kind == "videoinput");
    if (videoDevices.length < 2) {
        // The RGB and depth streams show up as separate cameras, so if we see
        // only 1 camera, we can be sure it's not a depth camera.
        console.log(videoDevices);
        throw {
            name: "NoDepthCamera",
            message: "Did not detect any depth camera.",
        };
    }
    var depthDevices = videoDevices
        .filter((device) => device.label.indexOf("RealSense") !== -1 );
    if (depthDevices.length < 2) {
        console.log(videoDevices);
        showErrorToUser("No Intel RealSense devices found. Trying anyway, " +
                        "but results might look bad.");
        depthDevices = videoDevices;
    }

    var cameraName = findCameraName(depthDevices[0].label);
    // Select streams from these ids, so that some other camera doesn't get
    // selected (e.g. if the user has another rgb camera).
    var ids = depthDevices.map((device) => device.deviceId);

    function videoKindNotSupported(error) {
        showErrorToUser("Your browser version is too old and doesn't support \
                        the 'videoKind: depth' constraint");
        console.error(error);
    }

    // Select color stream.
    var constraints = {
        audio: false,
        video: {
            videoKind: { exact: "color" },
            deviceId: { exact: ids },
        },
    };
    navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
            var video = document.getElementById("colorStream");
            video.srcObject = stream;
        })
        .catch(videoKindNotSupported);

    // Select depth stream.
    var constraints2 = {
        audio: false,
        video: {
            videoKind: { exact: "depth" },
            deviceId: { exact: ids },
            // Temporary workaround for the R200 camera.
            // Without it, the videoKind=depth constraint might also select the
            // infrared stream instead.
            width: { ideal: 628 }
        }
    };
    navigator.mediaDevices.getUserMedia(constraints2)
        .then(function(stream) {
            var video = document.getElementById("depthStream");
            video.srcObject = stream;
        })
        .catch(videoKindNotSupported);

    return cameraName;
}

// Return a Promise that outputs a string with the camera name.
function setupCamera() {
    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.enumerateDevices ||
        !navigator.mediaDevices.getUserMedia) {
        return Promise.reject(
            "Your browser doesn't support the mediaDevices API.");
    }
    var constraints = {
        video: {
            videoKind: { exact: "depth" },
        }
    };
    // The extra getUserMedia call is a workaround for issue
    // https://bugs.chromium.org/p/chromium/issues/detail?id=702124
    return navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
            return navigator.mediaDevices.enumerateDevices();
        })
        .catch(function(error) {
            showErrorToUser("Either you have no camera connected or your \
                            browser version is too old and doesn't \
                            support the 'videoKind: depth' constraint");
            throw error;
        })
        .then(activateDepthCamera);
}

// This should be removed once the MediaCapture-Depth API works.
function findCameraName(label) {
    if (label.includes("R200")) {
        return "R200";
    } else if (label.includes("Camera S") || label.includes("SR300")) {
        return "SR300";
    } else {
        return label;
    }
}


// Figure out the camera intristics based on the name of the camera.
//
// This should be rewritten once the MediaCapture-Depth API works - don't
// hardcode the values based on camera name, but query it from the API.
//
// The documentation for these parameters is in the vertex shader in
// `index.html`.
function getCameraParameters(cameraName) {
    var distortionModels = {
        NONE: 0,
        MODIFIED_BROWN_CONRADY: 1,
        INVERSE_BROWN_CONRADY: 2,
    };
    var result;
    if (cameraName === "R200")  {
        result = {
            depthScale: 0.001,
            depthOffset: new Float32Array(
                [ 233.3975067138671875, 179.2618865966796875 ]
            ),
            depthFocalLength: new Float32Array(
                [ 447.320953369140625, 447.320953369140625 ]
            ),
            colorOffset: new Float32Array(
                [ 311.841033935546875, 229.7513275146484375 ]
            ),
            colorFocalLength: new Float32Array(
                [ 627.9630126953125, 634.02410888671875 ]
            ),
            depthToColor: [
                0.99998325109481811523, 0.002231199527159333229, 0.00533978315070271492, 0,
                -0.0021383403800427913666, 0.99984747171401977539, -0.017333013936877250671, 0,
                -0.0053776423446834087372, 0.017321307212114334106, 0.99983555078506469727, 0,
                -0.058898702263832092285, -0.00020283895719330757856, -0.0001998419174924492836, 1
            ],
            depthDistortionModel: distortionModels.NONE,
            depthDistortioncoeffs: [ 0, 0, 0, 0, 0 ],
            colorDistortionModel: distortionModels.MODIFIED_BROWN_CONRADY,
            colorDistortioncoeffs: [
                -0.078357703983783721924,
                0.041351985186338424683,
                -0.00025565386749804019928,
                0.0012357287341728806496,
                0
            ],
        };
    } else if (cameraName === "SR300")  {
        result =  {
            depthScale: 0.0001249866472790017724,
            depthOffset: new Float32Array(
                [ 310.743988037109375, 245.1811676025390625 ]
            ),
            depthFocalLength: new Float32Array(
                [ 475.900726318359375, 475.900726318359375]
            ),
            colorOffset: new Float32Array(
                [ 312.073974609375, 241.969329833984375 ]
            ),
            colorFocalLength: new Float32Array(
                [ 617.65087890625, 617.65093994140625 ]
            ),
            depthToColor: [
                0.99998641014099121094, -0.0051436689682304859161, 0.00084982655243948101997, 0,
                0.0051483912393450737, 0.99997079372406005859, -0.005651625804603099823, 0,
                -0.00082073162775486707687, 0.0056559243239462375641, 0.99998366832733154297, 0,
                0.025699997320771217346, -0.00073326355777680873871, 0.0039400043897330760956, 1
            ],
            depthDistortionModel: distortionModels.INVERSE_BROWN_CONRADY,
            depthDistortioncoeffs: [
                0.14655706286430358887,
                0.078352205455303192139,
                0.0026113723870366811752,
                0.0029218809213489294052,
                0.066788062453269958496,
            ],
            colorDistortionModel: distortionModels.NONE,
            colorDistortioncoeffs: [ 0, 0, 0, 0, 0 ],
        };
    } else {
        throw {
            name: "CameraNotSupported",
            message: "Sorry, your camera '" + cameraName + "' is not supported",
        };
    }
    // This also de-normalizes the depth value (it's originally a 16-bit
    // integer normalized into a float between 0 and 1).
    result.depthScale = result.depthScale * 65535;
    return result;
}

// Take the parameters returned from `getCameraParameters` and upload them as
// uniforms into the shaders.
function uploadCameraParameters(gl, program, parameters) {
    var shaderVar = gl.getUniformLocation(program, "u_depth_scale");
    gl.uniform1f(shaderVar, parameters.depthScale);
    shaderVar = gl.getUniformLocation(program, "u_depth_focal_length");
    gl.uniform2fv(shaderVar, parameters.depthFocalLength);
    shaderVar = gl.getUniformLocation(program, "u_depth_offset");
    gl.uniform2fv(shaderVar, parameters.depthOffset);
    shaderVar = gl.getUniformLocation(program, "u_depth_distortion_model");
    gl.uniform1i(shaderVar, parameters.depthDistortionModel);
    shaderVar = gl.getUniformLocation(program, "u_depth_distortion_coeffs");
    gl.uniform1fv(shaderVar, parameters.depthDistortioncoeffs);
    shaderVar = gl.getUniformLocation(program, "u_color_focal_length");
    gl.uniform2fv(shaderVar, parameters.colorFocalLength);
    shaderVar = gl.getUniformLocation(program, "u_color_offset");
    gl.uniform2fv(shaderVar, parameters.colorOffset);
    shaderVar = gl.getUniformLocation(program, "u_color_distortion_model");
    gl.uniform1i(shaderVar, parameters.colorDistortionModel);
    shaderVar = gl.getUniformLocation(program, "u_color_distortion_coeffs");
    gl.uniform1fv(shaderVar, parameters.colorDistortioncoeffs);
    shaderVar = gl.getUniformLocation(program, "u_depth_to_color");
    gl.uniformMatrix4fv(shaderVar, false, parameters.depthToColor);
}

function main() {
    "use strict";

    var gl, program, textures;
    try {
        var canvasElement = document.getElementById("webglcanvas");
        canvasElement.onmousedown = handleMouseDown;
        document.onmouseup = handleMouseUp;
        document.onmousemove = handleMouseMove;
        gl = canvasElement.getContext("webgl2");
    } catch (e) {
        console.error("Could not create WebGL2 context: " + e);
        showErrorToUser("Your browser doesn't support WebGL2.");
        return false;
    }
    try {
        program = setupProgram(gl);
        textures = setupTextures(gl, program);
        gl.getExtension("EXT_color_buffer_float");

    } catch (e) {
        console.error(e.name + ": " + e.message);
        showErrorToUser("Errors while executing WebGL: " + e.name);
        return false;
    }


    setupCamera()
        .then(function(cameraName) {
            var cameraParameters = getCameraParameters(cameraName);
            uploadCameraParameters(gl, program, cameraParameters);
        })
        .catch(handleError);

    var colorStreamElement = document.getElementById("colorStream");
    var depthStreamElement = document.getElementById("depthStream");
    var colorStreamReady = false;
    var depthStreamReady = false;
    colorStreamElement.oncanplay = function() { colorStreamReady = true; };
    depthStreamElement.oncanplay = function() { depthStreamReady = true; };

    var ranOnce = false;
    // Run for each frame. Will do nothing if the camera is not ready yet.
    var animate=function() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (colorStreamReady && depthStreamReady) {
            var width = depthStreamElement.videoWidth;
            var height = depthStreamElement.videoHeight;
            if ( ! ranOnce ) {
                var shaderDepthTextureSize =
                    gl.getUniformLocation(program, "u_depth_texture_size");
                gl.uniform2f(shaderDepthTextureSize, width, height);

                var shaderColorTextureSize =
                    gl.getUniformLocation(program, "u_color_texture_size");
                gl.uniform2f(shaderColorTextureSize,
                    colorStreamElement.videoWidth,
                    colorStreamElement.videoHeight);

                gl.canvas.width = width;
                gl.canvas.height = height;
                gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

                var indices = [];
                for (var i = 0; i < width; i++) {
                    for (var j = 0; j < height; j++) {
                        indices.push(i);
                        indices.push(j);
                    }
                }
                var shaderDepthTextureIndex =
                    gl.getAttribLocation(program, "a_depth_texture_index");
                gl.enableVertexAttribArray(shaderDepthTextureIndex);
                var buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER,
                    new Float32Array(indices),
                    gl.STATIC_DRAW);
                gl.vertexAttribPointer(shaderDepthTextureIndex,
                    2, gl.FLOAT, false, 0, 0);
                ranOnce = true;
            }
            var shaderMvp = gl.getUniformLocation(program, "u_mvp");
            gl.uniformMatrix4fv(shaderMvp, false, getMvpMatrix(width, height));

            try {
                // Upload the camera frame for both the RGB camera and depth.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, textures.colorStreamTexture);
                gl.texImage2D(gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    colorStreamElement);

                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, textures.depthStreamTexture);
                gl.texImage2D(gl.TEXTURE_2D,
                    0,
                    gl.R32F,
                    gl.RED,
                    gl.FLOAT,
                    depthStreamElement);
            }
            catch(e) {
                console.error("Error uploading video to WebGL: " +
                    e.name + ", " + e.message);
            }
            // create a vertex for each pixel in the depth stream
            gl.drawArrays(gl.POINTS, 0, width * height);

        }
        window.requestAnimationFrame(animate);
    };
    animate();
}
