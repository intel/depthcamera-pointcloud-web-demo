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

document.onmouseup = handleMouseUp;
document.onmousemove = handleMouseMove;

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
