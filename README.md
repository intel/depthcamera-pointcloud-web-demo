# Depth Camera Pointcloud Demo

Uses an Intel® RealSense™ camera to get depth data and creates a [point
cloud](https://en.wikipedia.org/wiki/Point_cloud) out of it.

![Screen recording](https://github.com/01org/depthcamera-pointcloud-web-demo/raw/master/recording.gif)

It's supported on Windows, Linux and ChromeOS with Intel® RealSense™
SR300 (and related cameras like Razer Stargazer or Creative BlasterX
Senz3D) and R200 3D Cameras.

You will need Chromium release 58 and later. Release 58 is under testing
and the installation is available on the
[dev channel](https://www.chromium.org/getting-involved/dev-channel).

An explanation on how to use the depth camera is in the article
[Depth Camera Capture in HTML5](https://01.org/chromium/blogs/astojilj/2017/depth-camera-capture-html5).

## Setup

1. To make sure your system supports the camera, follow the [installation
guide](https://github.com/IntelRealSense/librealsense#installation-guide)
in librealsense.

2. Make sure you have Chromium version of at least 58 - install it from the
[dev channel](https://www.chromium.org/getting-involved/dev-channel) if not.

3. Connect the camera.

4. Go to 
[the demo page](https://01org.github.io/depthcamera-pointcloud-web-demo/).


To run the code locally, give Chromium the parameter
`--use-fake-ui-for-media-stream`, so that it doesn't ask you for camera
permissions, which are remembered only for https pages.

---
Intel and Intel RealSense are trademarks of Intel Corporation in the U.S. and/or
other countries.
