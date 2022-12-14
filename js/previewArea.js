/**
 * Created by Johnson on 2/15/2017.
 */

/**
 * This class controls the preview 3D area. It controls the creation of glyphs (nodes), edges, shortest path edges. It
 * also executes the update requests to those objects. It init the VR environment when requested.
 * @param canvas_ a WebGl canvas
 * @param model_ a Model object
 * @constructor
 */

import * as THREE from 'three'
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";
import {FirstPersonControls} from "three/examples/jsm/controls/FirstPersonControls";
import {ArcballControls} from "three/examples/jsm/controls/ArcballControls";
import {FlyControls} from "three/examples/jsm/controls/FlyControls";
import {TrackballControls} from "three/examples/jsm/controls/TrackballControls";
import {TransformControls} from "three/examples/jsm/controls/TransformControls";


//import * as quat from "./external-libraries/gl-matrix/quat.js";
// import {isLoaded, dataFiles  , mobile} from "./globals";
import {atlas} from './globals';
import {getNormalGeometry, getNormalMaterial} from './graphicsUtils.js'
import {
    activeVR,
    clrNodesSelected,
    getEnableEB,
    getNodesSelected,
    getRoot,
    getSpt,
    getThresholdModality,
    getVisibleNodes,
    getVisibleNodesLength,
    glyphNodeDictionary,
    setNodesSelected,
    setRoot,
    setVisibleNodes,
    updateNodeMoveOver,
    updateNodeSelection,
    vr,
} from './drawing'
import {getShortestPathVisMethod, NUMBER_HOPS, SHORTEST_DISTANCE} from './GUI'
import {scaleColorGroup} from './utils/scale'
//import {WebXRButton} from './external-libraries/vr/webxr-button.js'; //Prettier button but not working so well
//import { VRButton } from './external-libraries/vr/VRButton.js';
import {VRButton} from 'three/examples/jsm/webxr/VRButton.js';
//import { XRControllerModelFactory } from './external-libraries/vr/XRControllerModelFactory.js';
import {XRControllerModelFactory} from "three/examples/jsm/webxr/XRControllerModelFactory.js";


function PreviewArea(canvas_, model_, name_) {
    var name = name_;
    var model = model_;
    var canvas = canvas_;
    var camera = null, renderer = null, controls = null, scene = null, raycaster = null, gl = null;
    var nodeLabelSprite = null, nodeNameMap = null, nspCanvas = null;
    var clock = new THREE.Clock();

    // VR stuff
    var vrControl = null, effect = null;
    var controllerLeft = null, controllerRight = null, xrInputLeft = null, xrInputRight = null,
        enableRender = true;
    var pointerLeft = null, pointerRight = null;      // left and right controller pointers for pointing at things
    var enableVR = false;
    var activateVR = false;
    var vrButton = null;
    let controllerLeftSelectState = false, controllerRightSelectState = false;

    // XR stuff
    var xrButton = null;
    let xrRefSpace = null;
    let xrImmersiveRefSpace = null;
    let xrInlineRefSpace = null;
    let inlineSession = null;
    let controller, controllerGrip, controllerGripLeft, controllerGripRight;

    // nodes and edges
    var brain = null; // three js group housing all glyphs and edges
    var glyphs = [];
    var displayedEdges = [];

    // shortest path
    var shortestPathEdges = [];

    var edgeOpacity = 1.0;

    this.initXR = function () {
        //init VR //todo: this is stub now

        document.addEventListener('keypress', this.keyPress.bind(this), false);
        console.log("Init XR for PV: " + name);
        enableVR = true;
        activateVR = false;

        //renderer.outputEncoding = THREE.sRGBEncoding; //The robot says this makes the colors look better in VR but it makes the colors look worse in the browser
        renderer.xr.enabled = true;


        function onSelectStart() {

            this.userData.isSelecting = true;
            console.log("Select start");
        }

        function onSelectEnd() {

            this.userData.isSelecting = false;
            console.log("Select end");
        }

        var v3Origin = new THREE.Vector3(0, 0, 0);
        var v3UnitUp = new THREE.Vector3(0, 0, -100);

        controllerLeft = renderer.xr.getController(0);
        controllerLeft.addEventListener('selectstart', onSelectStart);
        controllerLeft.addEventListener('selectend', onSelectEnd);
        controllerLeft.addEventListener('connected', function (event) {
            controllerLeft.gamepad = event.data.gamepad;
            console.log("Left controller connected");
            console.log("event data: ");
            console.log(event.data);
            xrInputLeft = event.data;
            //  this.add( buildController( event.data ) );
            this.add(drawPointer(v3Origin, v3UnitUp));

        });

        controllerLeft.addEventListener('disconnected', function () {

            this.remove(this.children[0]);

        });
        scene.add(controllerLeft);

        controllerRight = renderer.xr.getController(1);
        controllerRight.addEventListener('selectstart', onSelectStart);
        controllerRight.addEventListener('selectend', onSelectEnd);
        controllerRight.addEventListener('connected', function (event) {
            controllerRight.gamepad = event.data.gamepad;
            //this.add( buildController( event.data ) );
            console.log("Right controller connected: ");
            console.log("event data: ");
            xrInputRight = event.data;
            console.log(event.data);

            this.add(drawPointer(v3Origin, v3UnitUp));//
        });
        controllerRight.addEventListener('disconnected', function () {

            this.remove(this.children[0]);

        });
        scene.add(controllerRight);

        const controllerModelFactory = new XRControllerModelFactory();

        controllerGripLeft = renderer.xr.getControllerGrip(0);
        controllerGripLeft.add(controllerModelFactory.createControllerModel(controllerGripLeft));
        scene.add(controllerGripLeft);

        controllerGripRight = renderer.xr.getControllerGrip(1);
        controllerGripRight.add(controllerModelFactory.createControllerModel(controllerGripRight));
        scene.add(controllerGripRight);


        //document.body
        document.getElementById('vrButton' + name).appendChild(VRButton.createButton(renderer));

    }


    function buildController(data) {

        let geometry, material;

        switch (data.targetRayMode) {

            case 'tracked-pointer':

                geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
                geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3));

                material = new THREE.LineBasicMaterial({vertexColors: true, blending: THREE.AdditiveBlending});

                return new THREE.Line(geometry, material);

            case 'gaze':

                geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
                material = new THREE.MeshBasicMaterial({opacity: 0.5, transparent: true});
                return new THREE.Mesh(geometry, material);

        }


    }


    // request VR activation - desktop case
    // advise renaming this function to avoid conflict with variable
    // this.activateVR = function (activate) {
    //     if (activate == activateVR)
    //         return;
    //     activateVR = activate;
    //     if (!mobile) {
    //         if (activateVR) {
    //             console.log("Activate VR for PV: " + name);
    //             //effect.requestPresent();
    //         } else
    //             console.log("Disable VR for PV: " + name);
    //         //effect.exitPresent();
    //     }
    // };


    /*   // Called when the user selects a device to present to. In response we
       // will request an exclusive session from that device.
       function onRequestSession() {
           return navigator.xr.requestSession('immersive-vr').then((session) => { // onSessionStarted);
               xrButton.setSession(session);
               // Set a flag on the session so we can differentiate it from the
               // inline session.
               session.isImmersive = true;
               onSessionStarted(session);
           });
       }

       // Called either when the user has explicitly ended the session (like in
       // onEndSession()) or when the UA has ended the session for any reason.
       // At this point the session object is no longer usable and should be
       // discarded.
       function onSessionEnded(event) {
           xrButton.setSession(null);

           // In this simple case discard the WebGL context too, since we're not
           // rendering anything else to the screen with it.
           // renderer = null;
       }


       // Called when the user clicks the 'Exit XR' button. In response we end
       // the session.
       function onEndSession(session) {
           session.end();
       }

       // Creates a WebGL context and initializes it with some common default state.
       function createWebGLContext(glAttribs) {
           glAttribs = glAttribs || {alpha: false};

           let webglCanvas = document.createElement('canvas'); //
                               //document.getElementById('mycanvas' + name); // document.createElement('canvas');
           console.log("Canvas: " + webglCanvas);
           let contextTypes = glAttribs.webgl2 ? ['webgl2'] : ['webgl', 'experimental-webgl'];
           let context = null;

           for (let contextType of contextTypes) {
               context = webglCanvas.getContext(contextType, glAttribs);
               if (context) {
                   break;
               }
           }

           if (!context) {
               let webglType = (glAttribs.webgl2 ? 'WebGL 2' : 'WebGL');
               console.error('This browser does not support ' + webglType + '.');
               return null;
           }

           return context;
       }

       // init Oculus Rift
       this.initXR = function () {
           //init VR //todo: this is stub now

           console.log("Init XR for PV: " + name);
           enableVR = true;
           activateVR = false;

           xrButton = new WebXRButton({
               onRequestSession: onRequestSession,
               onEndSession: onEndSession
           });
           // document.querySelector('header').appendChild(xrButton.domElement);
           document.getElementById('vrButton' + name).appendChild(xrButton.domElement);


           // init VR
           vrButton = document.getElementById('vrButton' + name);
           console.log("vrButton: " + vrButton);

           //vrButton.addEventListener('click', function () {
           //vrButton.style.display = 'none';
           //vrButton.innerHTML = 'Enter VR';
           //  console.log("Click On VR Button: " + name);
           //effect.requestPresent();
           //}, false);

           // Is WebXR available on this UA?
           if (navigator.xr) {
               // If the device allows creation of exclusive sessions set it as the
               // target of the 'Enter XR' button.
               navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
                   xrButton.enabled = supported;
               });

               // Start up an inline session, which should always be supported on
               // browsers that support WebXR regardless of the available hardware.
               navigator.xr.requestSession('inline').then((session) => {
                   inlineSession = session;
                   onSessionStarted(session);
                   //updateFov(); //todo: make an FoV slider
               });
           }

       } //this.initRXR



               // Called when we've successfully acquired a XRSession. In response we
               // will set up the necessary session state and kick off the frame loop.
               function onSessionStarted(session) {
                   // THis line is left over from the immersive VR example:
                   // This informs the 'Enter XR' button that the session has started and
                   // that it should display 'Exit XR' instead.
                   //xrButton.setSession(session) // So, this is needed in "inline" mode.... not sure why.
                   // It actually breaks the "Enter VR" buttons - makes them start immersive mode on initXR


                   // Listen for the sessions 'end' event so we can respond if the user
                   // or UA ends the session for any reason.
                   session.addEventListener('end', onSessionEnded);

                   // Create a WebGL context to render with, initialized to be compatible
                   // with the XRDisplay we're presenting to.
                   if (!gl) {
                       gl = createWebGLContext({
                           xrCompatible: true
                       });

                       // In order for an inline session to be used we must attach the WebGL
                       // canvas to the document, which will serve as the output surface for
                       // the results of the inline session's rendering.
                       document.getElementById('canvas' + name).appendChild(gl.canvas);

                       // The canvas is synced with the window size via CSS, but we still
                       // need to update the width and height attributes in order to keep
                       // the default framebuffer resolution in-sync.
                       function onResize() {
                           gl.canvas.width = gl.canvas.clientWidth * window.devicePixelRatio;
                           gl.canvas.height = gl.canvas.clientHeight * window.devicePixelRatio;
                       }

                       window.addEventListener('resize', onResize);
                       onResize();

                       // Installs the listeners necessary to allow users to look around with
                       // inline sessions using the mouse or touch.
                       addInlineViewListeners(gl.canvas);


                   } //if (!gl)


                   // WebGL layers for inline sessions won't allocate their own framebuffer,
                   // which causes gl commands to naturally execute against the default
                   // framebuffer while still using the canvas dimensions to compute
                   // viewports and projection matrices.
                   let glLayer = new XRWebGLLayer(session, gl);

                   session.updateRenderState({
                       baseLayer: glLayer
                   });

                   // Get a frame of reference, which is required for querying poses. In
                   // this case an 'local' frame of reference means that all poses will
                   // be relative to the location where the XRDevice was first detected.
                   let refSpaceType = session.isImmersive ? 'local' : 'viewer';
                   session.requestReferenceSpace(refSpaceType).then((refSpace) => {
                       // Since we're dealing with multiple sessions now we need to track
                       // which XRReferenceSpace is associated with which XRSession.
                       if (session.isImmersive) {
                           xrImmersiveRefSpace = refSpace;
                       } else {
                           xrInlineRefSpace = refSpace;
                       }
                       session.requestAnimationFrame(onXRFrame);
                   });

               } //onSessionStarted

       // Make the canvas listen for mouse and touch events so that we can
       // adjust the viewer pose accordingly in inline sessions.
       function addInlineViewListeners(canvas) {
           canvas.addEventListener('mousemove', (event) => {
               // Only rotate when the right button is pressed
               if (event.buttons && 2) {
                   rotateView(event.movementX, event.movementY);
               }
           });

           // Keep track of touch-related state so that users can touch and drag on
           // the canvas to adjust the viewer pose in an inline session.
           let primaryTouch = undefined;
           let prevTouchX = undefined;
           let prevTouchY = undefined;

           // Keep track of all active touches, but only use the first touch to
           // adjust the viewer pose.
           canvas.addEventListener("touchstart", (event) => {
               if (primaryTouch == undefined) {
                   let touch = event.changedTouches[0];
                   primaryTouch = touch.identifier;
                   prevTouchX = touch.pageX;
                   prevTouchY = touch.pageY;
               }
           });

           // Update the set of active touches now that one or more touches
           // finished. If the primary touch just finished, update the viewer pose
           // based on the final touch movement.
           canvas.addEventListener("touchend", (event) => {
               for (let touch of event.changedTouches) {
                   if (primaryTouch == touch.identifier) {
                       primaryTouch = undefined;
                       rotateView(touch.pageX - prevTouchX, touch.pageY - prevTouchY);
                   }
               }
           });

           // Update the set of active touches now that one or more touches was
           // cancelled. Don't update the viewer pose when the primary touch was
           // cancelled.
           canvas.addEventListener("touchcancel", (event) => {
               for (let touch of event.changedTouches) {
                   if (primaryTouch == touch.identifier) {
                       primaryTouch = undefined;
                   }
               }
           });

           // Only use the delta between the most recent and previous events for
           // the primary touch. Ignore the other touches.
           canvas.addEventListener("touchmove", (event) => {
               for (let touch of event.changedTouches) {
                   if (primaryTouch == touch.identifier) {
                       rotateView(touch.pageX - prevTouchX, touch.pageY - prevTouchY);
                       prevTouchX = touch.pageX;
                       prevTouchY = touch.pageY;
                   }
               }
           });
       } //addInlineViewListeners

           // Called every time the XRSession requests that a new frame be drawn.
       function onXRFrame(t, frame) {
           let session = frame.session;
           // Ensure that we're using the right frame of reference for the session.
           let refSpace = session.isImmersive ?
               xrImmersiveRefSpace :
               xrInlineRefSpace;

           // Account for the click-and-drag mouse movement or touch movement when
           // calculating the viewer pose for inline sessions.
           if (!session.isImmersive) {
               refSpace = getAdjustedRefSpace(refSpace);
           }



           // Get the XRDevice pose relative to the Frame of Reference we created
           // earlier.
           let pose = frame.getViewerPose(refSpace);

           // Inform the session that we're ready for the next frame.
           session.requestAnimationFrame(onXRFrame);

           // Getting the pose may fail if, for example, tracking is lost. So we
           // have to check to make sure that we got a valid pose before attempting
           // to render with it. If not in this case we'll just leave the
           // framebuffer cleared, so tracking loss means the scene will simply
           // disappear.
           if (pose) {
               let glLayer = session.renderState.baseLayer;

               // If we do have a valid pose, bind the WebGL layer's framebuffer,
               // which is where any content to be displayed on the XRDevice must be
               // rendered.
               gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

               // Clear the framebuffer
               gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

               // Loop through each of the views reported by the frame and draw them
               // into the corresponding viewport.
               for (let view of pose.views) {
                   let viewport = glLayer.getViewport(view);
                   gl.viewport(viewport.x, viewport.y,
                       viewport.width, viewport.height);

                   // Draw this view of the scene. What happens in this function really
                   // isn't all that important. What is important is that it renders
                   // into the XRWebGLLayer's framebuffer, using the viewport into that
                   // framebuffer reported by the current view, and using the
                   // projection matrix and view transform from the current view.
                   // We bound the framebuffer and viewport up above, and are passing
                   // in the appropriate matrices here to be used when rendering.
                   //scene.draw(view.projectionMatrix, view.transform);
                   console.log("Draw Scene: " + view.transform.matrix + view.projectionMatrix);
               }

           } //if pose
       } //onXRFrame

       // Inline view adjustment code
       // Allow the user to click and drag the mouse (or touch and drag the
       // screen on handheld devices) to adjust the viewer pose for inline
       // sessions. Samples after this one will hide this logic with a utility
       // class (InlineViewerHelper).
       let lookYaw = 0;
       let lookPitch = 0;
       const LOOK_SPEED = 0.0025;

       // XRReferenceSpace offset is immutable, so return a new reference space
       // that has an updated orientation.
       function getAdjustedRefSpace(refSpace) {
           // Represent the rotational component of the reference space as a
           // quaternion.
           let invOrientation = quat.create();
           quat.rotateX(invOrientation, invOrientation, -lookPitch);
           quat.rotateY(invOrientation, invOrientation, -lookYaw);
           let xform = new XRRigidTransform(
               {x: 0, y: 0, z: 0},
               {x: invOrientation[0], y: invOrientation[1], z: invOrientation[2], w: invOrientation[3]});
           return refSpace.getOffsetReferenceSpace(xform);
       }
   */
    // vrButton.addEventListener('mouseover', function () {
    //         //vrButton.style.display = 'none';
    //         //vrButton.innerHTML = 'Enter VR NOW';
    //         console.log("Mouse Over VR Button: " + name);
    //         //effect.requestPresent();
    //     }, false);
    //effect.requestPresent();
    // I found some VR button HTML in the visualization.html file and tried to light them up
    // with OnClicks but they didn't seem to want to do anything so I tried that example class
    // and it worked a bit better.


    // OLD InitVR Code Here:
    // if (mobile) {
    //     console.log("Init VR for PV: " + name);
    //     enableVR = true;
    //     activateVR = true;
    //     // init VR
    //     vrButton = document.getElementById('vrButton' + name);
    //     vrButton.addEventListener('click', function () {
    //         vrButton.style.display = 'none';
    //         //effect.requestPresent();
    //     }, false);
    //     //effect.requestPresent();
    // } else {
    //     console.log("Init VR for PV: " + name);
    //     enableVR = true;
    //     activateVR = false;
    //     // init VR
    //     vrButton = document.getElementById('vrButton' + name);
    //     vrButton.addEventListener('click', function () {
    //         vrButton.style.display = 'none';
    //         //effect.requestPresent();
    //     }, false);
    //     //effect.requestPresent();
    // }
//    };

    //on resize
    this.onWindowResize = function () {
        if (enableVR)  //todo: Is this still required in WebXR model?
            return;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    };

    //listen for resize event
    window.addEventListener('resize', this.onWindowResize, false);


    // init Oculus Touch controllers
    // not supported in Firefox, only Google chromium
    // check https://webvr.info/get-chrome/
    // var initOculusTouch = function () {
    //     if (!enableVR)
    //         return;
    //
    //     controllerLeft = new THREE.ViveController(0);
    //     controllerRight = new THREE.ViveController(1);
    //
    //     var loader = new THREE.OBJLoader();
    //     loader.setPath('js/external-libraries/vr/models/obj/vive-controller/');
    //     loader.load('vr_controller_vive_1_5.obj', function (object) {
    //
    //         var loader = new THREE.TextureLoader();
    //         loader.setPath('js/external-libraries/vr/models/obj/vive-controller/');
    //
    //         var controller = object.children[0];
    //         controller.material.map = loader.load('onepointfive_texture.png');
    //         controller.material.specularMap = loader.load('onepointfive_spec.png');
    //
    //         controllerLeft.add(object.clone());
    //         controllerRight.add(object.clone());
    //
    //         controllerLeft.standingMatrix = vrControl.getStandingMatrix();
    //         controllerRight.standingMatrix = vrControl.getStandingMatrix();
    //
    //         scene.add(controllerLeft);
    //         scene.add(controllerRight);
    //     });
    //
    //     // controllerLeft.addEventListener('gripsup', function(e) { updateVRStatus('left'); }, true);
    //     // controllerRight.addEventListener('gripsup', function(e) { updateVRStatus('right'); }, true);
    //
    //     oculusTouchExist = true;
    //
    //     console.log("Init Oculus Touch done");
    // };

    // var initGearVRController = function () {
    //     if (!enableVR || !mobile)
    //         return;
    //
    //     // assume right handed user
    //     controllerRight = new THREE.GearVRController(0);
    //     //controllerRight.position.set( 25, - 50, 0 );
    //
    //
    //     var loader = new THREE.OBJLoader();
    //     loader.setPath('js/external-libraries/vr/models/obj/vive-controller/');
    //     loader.load('vr_controller_vive_1_5.obj', function (object) {
    //         var loader = new THREE.TextureLoader();
    //         loader.setPath('js/external-libraries/vr/models/obj/vive-controller/');
    //         var controller = object.children[0];
    //         controller.material.map = loader.load('onepointfive_texture.png');
    //         controller.material.specularMap = loader.load('onepointfive_spec.png');
    //         controllerRight.add(object.clone());
    //         controllerRight.standingMatrix = vrControl.getStandingMatrix();
    //         scene.add(controllerRight);
    //     });
    //
    //     gearVRControllerExist = true;
    //
    //     console.log("Init Gear VR Controller done");
    // };

    // var initWebVRForMobile = function () {
    //     // Initialize the WebVR UI.
    //     var uiOptions = {
    //         color: 'black',
    //         background: 'white',
    //         corners: 'round',
    //         height: 40,
    //         disabledOpacity: 0.9
    //     };
    //     vrButton = new webvrui.EnterVRButton(renderer.domElement, uiOptions);
    //     vrButton.on('exit', function () {
    //         updateVRStatus('disable');
    //     });
    //     vrButton.on('hide', function () {
    //         document.getElementById('vr' + name).style.display = 'none';
    //     });
    //     vrButton.on('show', function () {
    //         document.getElementById('vr' + name).style.display = 'inherit';
    //     });
    //     document.getElementById('vrButton' + name).appendChild(vrButton.domElement);
    //     document.getElementById('magicWindow' + name).addEventListener('click', function () {
    //         vr = true;
    //         activateVR = true;
    //         activeVR = name.toLowerCase();
    //         console.log("Active VR = " + activeVR);
    //         vrButton.requestEnterFullscreen();
    //     });
    // };

    // scan Gear VR controller
    // var scanGearVRController = function () {
    //     var thumbPad = controllerRight.getButtonState('thumbpad');
    //     var trigger = controllerRight.getButtonState('trigger');
    //     var angleX = null, angleY = null;
    //     var gamePadRight = controllerRight.getGamepad();
    //     if (gamePadRight && !trigger) {
    //         angleX = gamePadRight.axes[0];
    //         angleY = gamePadRight.axes[1];
    //         if (thumbPad) {
    //             brain.rotateX(0.2 * angleX);
    //             brain.rotateZ(0.2 * angleY);
    //         } else {
    //             brain.position.z += 5 * angleX;
    //             brain.position.x += 5 * angleY;
    //         }
    //         brain.matrixWorldNeedsUpdate = true;
    //     }
    //     var v3Origin = new THREE.Vector3(0, 0, 0);
    //     var v3UnitUp = new THREE.Vector3(0, 0, -100);
    //
    //     // Find all nodes within 0.1 distance from left Touch Controller
    //     var closestNodeIndexRight = 0, closestNodeDistanceRight = 99999.9;
    //     for (var i = 0; i < brain.children.length; i++) {
    //         var distToNodeIRight = controllerRight.position.distanceTo(brain.children[i].getWorldPosition());
    //         if ((distToNodeIRight < closestNodeDistanceRight)) {
    //             closestNodeDistanceRight = distToNodeIRight;
    //             closestNodeIndexRight = i;
    //         }
    //     }
    //
    //     var isLeft = (activateVR == 'left');
    //     if (trigger) {
    //         pointedNodeIdx = (closestNodeDistanceRight < 2.0) ? closestNodeIndexRight : -1;
    //
    //         if (pointerRight) {
    //             // Touch Controller pointer already on! scan for selection
    //             if (thumbPad) {
    //                 updateNodeSelection(model, getPointedObject(controllerRight), isLeft);
    //             }
    //         } else {
    //             pointerRight = drawPointer(v3Origin, v3UnitUp);
    //             controllerRight.add(pointerRight);
    //         }
    //         updateNodeMoveOver(model, getPointedObject(controllerRight));
    //     } else {
    //         if (pointerRight) {
    //             controllerRight.remove(pointerRight);
    //         }
    //         pointerRight = null;
    //     }
    // };
    function getNearestNodes(controller) {
        //todo this should fall back to camera if no controller
        if (!brain) return;
        if (!brain.children) return;
        if (!controller) {
            //todo: testing may not work
            //get nearest node to camera
            var closestNodeIndex = 0, closestNodeDistance = 99999.9;
            for (var i = 0; i < brain.children.length; i++) {
                var distToNodeI = camera.position.distanceTo(brain.children[i].getWorldPosition());
                if ((distToNodeI < closestNodeDistance)) {
                    closestNodeDistance = distToNodeI;
                    closestNodeIndex = i;
                }
            }
            return {closestNodeIndex: closestNodeIndex, closestNodeDistance: closestNodeDistance};
        } else {


            // Find all nodes within 0.1 distance from given Touch Controller
            var closestNodeIndex = 0, closestNodeDistance = 99999.9;
            for (var i = 0; i < brain.children.length; i++) {
                var distToNodeI = controller.position.distanceTo(brain.children[i].position);
                if ((distToNodeI < closestNodeDistance)) {
                    closestNodeDistance = distToNodeI;
                    closestNodeIndex = i;
                }

            }
            return {closestNodeIndex: closestNodeIndex, closestNodeDistance: closestNodeDistance};

        }
    }

    // scan the Oculus Touch for controls

    var xrDolly = new THREE.Object3D();

    var scanOculusTouch = function () {

        //exit if no controllers
        if (!controllerLeft || !controllerRight) return;
        //exit if no brain
        if (!brain) return;


        //check if in VR mode
        if (renderer.xr.isPresenting && xrInputLeft && xrInputRight) {
            //disable the mouse controls
            controls.enabled = false;

            //check if camera is the same as the webxr camera
            if (camera !== renderer.xr.getCamera()) {
                //if not, set the camera to the webxr camera
                camera = renderer.xr.getCamera();
                //display console, camera changed
                console.log("camera changed to vr camera");
            }

            //check if the camera is a child of the xrDolly
            if (!camera.parent) {
                //if not, add the camera to the xrDolly
                xrDolly.add(camera);
                //add controllers to dolly
                xrDolly.add(controllerLeft);
                xrDolly.add(controllerRight);
                xrDolly.add(controllerGripLeft);
                xrDolly.add(controllerGripRight);
                //add the xrDolly to the scene
                scene.add(xrDolly);
                //move xrDolly back to fit brain in view
                xrDolly.position.z = -500;
                console.log("xrDolly moved back to fit brain in view");
                console.log("camera added to dolly, dolly added to scene");
            }


            var cameraMaxTranslationSpeed = 1;
            var cameraMaxRotationSpeed = 0.01;
            var translationDecay = 0.01;
            var rotationDecay = 0.01;
            var maxTranslationAcceleration = 0.1;
            var maxRotationAcceleration = 0.1;

            var currentTranslationSpeed = new THREE.Vector3(0, 0, 0);
            var currentRotationSpeed = new THREE.Vector3(0, 0, 0);
            let delta = clock.getDelta();
            //get value of left thumbstick x axis
            if (xrInputLeft.gamepad.axes.length > 0) {
                var leftThumbstickX = controllerLeft.gamepad.axes[2];
                var leftThumbstickY = controllerLeft.gamepad.axes[3];
                //multiply by max increment
                var leftThumbstickXIncrement = leftThumbstickX * cameraMaxTranslationSpeed;
                var leftThumbstickYIncrement = leftThumbstickY * cameraMaxTranslationSpeed;
                //limit increment to max increment
                if (leftThumbstickXIncrement > maxTranslationAcceleration) {
                    leftThumbstickXIncrement = maxTranslationAcceleration;
                }
                if (leftThumbstickXIncrement < -maxTranslationAcceleration) {
                    leftThumbstickXIncrement = -maxTranslationAcceleration;
                }
                if (leftThumbstickYIncrement > maxTranslationAcceleration) {
                    leftThumbstickYIncrement = maxTranslationAcceleration;
                }
                if (leftThumbstickYIncrement < -maxTranslationAcceleration) {
                    leftThumbstickYIncrement = -maxTranslationAcceleration;
                }

                //apply translation to current translation speed forward and backward
                currentTranslationSpeed.x += leftThumbstickXIncrement;
                currentTranslationSpeed.z += leftThumbstickYIncrement;

            }
            //get value of right thumbstick x axis
            if (xrInputRight.gamepad.axes.length > 0) {
                //use to rotate left right up or down
                var rightThumbstickX = controllerRight.gamepad.axes[3];
                var rightThumbstickY = controllerRight.gamepad.axes[2];
                //multiply by max increment
                var rightThumbstickXIncrement = rightThumbstickX * cameraMaxRotationSpeed;
                var rightThumbstickYIncrement = rightThumbstickY * cameraMaxRotationSpeed;
                //limit increment to max increment
                if (rightThumbstickXIncrement > maxRotationAcceleration) {
                    rightThumbstickXIncrement = maxRotationAcceleration;
                }
                if (rightThumbstickXIncrement < -maxRotationAcceleration) {
                    rightThumbstickXIncrement = -maxRotationAcceleration;
                }
                if (rightThumbstickYIncrement > maxRotationAcceleration) {
                    rightThumbstickYIncrement = maxRotationAcceleration;
                }
                if (rightThumbstickYIncrement < -maxRotationAcceleration) {
                    rightThumbstickYIncrement = -maxRotationAcceleration;
                }
                //apply rotation
                currentRotationSpeed.x += rightThumbstickXIncrement;
                currentRotationSpeed.y -= rightThumbstickYIncrement;

            }

            //decay the translation speed using the decay value and delta time
            currentTranslationSpeed.x -= currentTranslationSpeed.x * translationDecay * delta;
            currentTranslationSpeed.y -= currentTranslationSpeed.y * translationDecay * delta;
            currentTranslationSpeed.z -= currentTranslationSpeed.z * translationDecay * delta;
            //decay the rotation speed using the decay value and delta time
            currentRotationSpeed.x -= currentRotationSpeed.x * rotationDecay * delta;
            currentRotationSpeed.y -= currentRotationSpeed.y * rotationDecay * delta;
            currentRotationSpeed.z -= currentRotationSpeed.z * rotationDecay * delta;

            if (Math.abs(currentTranslationSpeed.x) < 0.001) {
                //if so, set it to 0
                currentTranslationSpeed.x = 0;
            }
            //check if the translation speed is less than 0.001
            if (Math.abs(currentTranslationSpeed.y) < 0.001) {
                //if so, set it to 0
                currentTranslationSpeed.y = 0;
            }

            //check if the rotation speed is less than 0.001
            if (Math.abs(currentRotationSpeed.x) < 0.001) {
                //if so, set it to 0
                currentRotationSpeed.x = 0;
            }
            //check if the rotation speed is less than 0.001
            if (Math.abs(currentRotationSpeed.y) < 0.001) {
                //if so, set it to 0
                currentRotationSpeed.y = 0;
            }

            //apply the translation speed to the xrDolly
            xrDolly.translateX(currentTranslationSpeed.x);
            xrDolly.translateY(currentTranslationSpeed.y);
            xrDolly.translateZ(currentTranslationSpeed.z);
            //apply the rotation speed to the camera
            xrDolly.rotateX(currentRotationSpeed.x);
            xrDolly.rotateY(currentRotationSpeed.y);
            xrDolly.rotateZ(currentRotationSpeed.z);

            // //if current speeds are not 0, log to console
            // if(currentTranslationSpeed.x != 0 || currentTranslationSpeed.y != 0 || currentTranslationSpeed.z != 0 || currentRotationSpeed.x != 0 || currentRotationSpeed.y != 0 || currentRotationSpeed.z != 0) {
            //     console.log("currentTranslationSpeed: ");
            //     console.log(currentTranslationSpeed);
            //     console.log("currentRotationSpeed: ");
            //     console.log(currentRotationSpeed);
            // }


        } else {
            //every minute or so, log the controller object to the console if we still don't have inputs
            var lastControllerLog = new Date();
            if (Date.now() - lastControllerLog > 60000) {
                console.log(controllerLeft);
                console.log(controllerRight);
                lastControllerLog = Date.now();
            }
        }


        //     var boostRotationSpeed = controllerLeft.getButtonState('grips') ? 0.1 : 0.02;
        //     var boostMoveSpeed = controllerRight.getButtonState('grips') ? 5.0 : 1.0;
        //     var angleX = null, angleY = null;
        //     var gamePadLeft = controllerLeft? controllerLeft.getGamepad() : nulll;
        //     var gamePadRight = controllerRight? controllerRight.getGamepad() : null;
        //     if (gamePadLeft) {
        //         angleX = gamePadLeft.axes[0];
        //         angleY = gamePadLeft.axes[1];
        //         brain.rotateX(boostRotationSpeed * angleX);
        //         brain.rotateZ(boostRotationSpeed * angleY);
        //         brain.matrixWorldNeedsUpdate = true;
        //         console.log("Left controller: " + angleX + ", " + angleY);
        //     }
        //
        //     if (gamePadRight) {
        //         angleX = gamePadRight.axes[0];
        //         angleY = gamePadRight.axes[1];
        //         if (controllerRight.getButtonState('thumbpad')) {
        //             brain.position.y += boostMoveSpeed * angleY;
        //         } else {
        //             brain.position.z += boostMoveSpeed * angleX;
        //             brain.position.x += boostMoveSpeed * angleY;
        //         }
        //         brain.matrixWorldNeedsUpdate = true;
        //     }
        //
        //     var v3Origin = new THREE.Vector3(0, 0, 0);
        //     var v3UnitUp = new THREE.Vector3(0, 0, -100.0);
        //     // var v3UnitFwd = new THREE.Vector3(0,0,1);

        var nearLeft = getNearestNodes(controllerLeft);
        var nearRight = getNearestNodes(controllerRight);
        var closestNodeIndexLeft = nearLeft.closestNodeIndex;
        var closestNodeDistanceLeft = nearLeft.closestNodeDistance;
        var closestNodeIndexRight = nearRight.closestNodeIndex;
        var closestNodeDistanceRight = nearRight.closestNodeDistance;

        //console.log("Left: " + closestNodeIndexLeft + ", " + closestNodeDistanceLeft);
        //console.log("Right: " + closestNodeIndexRight + ", " + closestNodeDistanceRight);


        if (true || VRButton.xrSessionIsGranted) {

            if (controllerLeftSelectState && !controllerLeft.userData.isSelecting) {  //release Left Trigger
                var isLeft = true;
                var pointedObject = getPointedObject(controllerLeft);
                updateNodeSelection(model, pointedObject, isLeft);
                updateNodeMoveOver(model, pointedObject, 2); //2 is for left touch controller

                //log event to console
                console.log("Left controller: " + controllerLeft.userData.isSelecting);
                //log selection to console
                console.log("Left controller: ");
                console.log(pointedObject);


            }
            if (controllerRightSelectState && !controllerRight.userData.isSelecting) {  //release Right Trigger
                var isLeft = true; //false;
                var pointedObject = getPointedObject(controllerRight);
                updateNodeSelection(model, pointedObject, isLeft);
                updateNodeMoveOver(model, pointedObject, 4); //4 is for right touch controller

                //log event to console
                console.log("Right controller: " + controllerRight.userData.isSelecting);
                //log selection to console
                console.log("Right controller: ")
                console.log(pointedObject);
            }


            //updatenodemoveover
            var pointedObjectLeft = getPointedObject(controllerLeft);
            updateNodeMoveOver(model, pointedObjectLeft, 2); //todo: enum for hover mode type
            var pointedObjectRight = getPointedObject(controllerRight);
            updateNodeMoveOver(model, pointedObjectRight, 4);
            if (!pointedObjectLeft && !pointedObjectRight) {
                updateNodeMoveOver(model, null, 6);
            }

        }


        controllerLeftSelectState = controllerLeft.userData.isSelecting;
        controllerRightSelectState = controllerRight.userData.isSelecting;


        //     // Find all nodes within 0.1 distance from left Touch Controller
        //     var closestNodeIndexLeft = 0, closestNodeDistanceLeft = 99999.9;
        //     var closestNodeIndexRight = 0, closestNodeDistanceRight = 99999.9;
        //     for (var i = 0; i < brain.children.length; i++) {
        //         var distToNodeILeft = controllerLeft.position.distanceTo(brain.children[i].getWorldPosition());
        //         if ((distToNodeILeft < closestNodeDistanceLeft)) {
        //             closestNodeDistanceLeft = distToNodeILeft;
        //             closestNodeIndexLeft = i;
        //         }
        //
        //         var distToNodeIRight = controllerRight.position.distanceTo(brain.children[i].getWorldPosition());
        //         if ((distToNodeIRight < closestNodeDistanceRight)) {
        //             closestNodeDistanceRight = distToNodeIRight;
        //             closestNodeIndexRight = i;
        //         }
        //     }
        //
        //     var isLeft = (activateVR == 'left');
        //     if (controllerLeft.getButtonState('trigger')) {
        //         pointedNodeIdx = (closestNodeDistanceLeft < 2.0) ? closestNodeIndexLeft : -1;
        //
        //         if (pointerLeft) {
        //             // Touch Controller pointer already on! scan for selection
        //             if (controllerLeft.getButtonState('grips')) {
        //                 updateNodeSelection(model, getPointedObject(controllerLeft), isLeft);
        //             }
        //         } else {
        //             pointerLeft = drawPointer(v3Origin, v3UnitUp);
        //             controllerLeft.add(pointerLeft);
        //         }
        //         updateNodeMoveOver(model, getPointedObject(controllerLeft));
        //     } else {
        //         if (pointerLeft) {
        //             controllerLeft.remove(pointerLeft);
        //         }
        //         pointerLeft = null;
        //     }
        //
        if (controllerRight.userData.isSelecting) {  //getButtonState('trigger')) {
            //         pointedNodeIdx = (closestNodeDistanceRight < 2.0) ? closestNodeIndexRight : -1;

            //
            console.log("Right controller Trigger: " + controllerRight.userData.isSelecting);
            //         if (pointerRight) {
            //             // Touch Controller pointer already on! scan for selection
            //             if (controllerRight.getButtonState('grips')) {
            //                 updateNodeSelection(model, getPointedObject(controllerRight), isLeft);
            //             }
            //         } else {
            //             pointerRight = drawPointer(v3Origin, v3UnitUp);
            //             controllerRight.add(pointerRight);
            //         }
            //         updateNodeMoveOver(model, getPointedObject(controllerRight));
        } else {
            //         if (pointerRight) {
            //             controllerRight.remove(pointerRight);
            //         }
            pointerRight = null;
        }
    }; // scanOculusTouch

    // draw a pointing line
    function drawPointer(start, end) {
        var material = new THREE.LineBasicMaterial();
        var points = [];
        points.push(start);
        points.push(end);

        var geometry = new THREE.BufferGeometry().setFromPoints(points);
        return new THREE.Line(geometry, material);
    }


    // initialize scene: init 3js scene, canvas, renderer and camera; add axis and light to the scene
    var initScene = function () {
        renderer.setSize(canvas.clientWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        canvas.appendChild(renderer.domElement);
        raycaster = new THREE.Raycaster();
        camera.position.z = 50;

        brain = new THREE.Group();
        scene.add(brain);

        //Adding light
        scene.add(new THREE.HemisphereLight(0x606060, 0x080820, 1.5));
        scene.add(new THREE.AmbientLight(0x606060, 1.5));
        var light = new THREE.PointLight(0xffffff, 1.0, 10000);
        light.position.set(1000, 1000, 100);
        scene.add(light);

        var axeshelper = new THREE.AxesHelper(5);
        scene.add(axeshelper);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.25;
        controls.enableZoom = true;
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0.5;
        controls.enablePan = true;
        controls.enableKeys = true;
        controls.minDistance = 10;
        controls.maxDistance = 1000;

        addNodeLabel();
    };

    this.resetCamera = function () {
        camera.position.set(50, 50, 50);
    };

    this.resetBrainPosition = function () {
        brain.updateMatrix();
        brain.position.set(0, 0, 0);
        brain.rotation.set(0, 0, 0);
        brain.scale.set(1, 1, 1);
        brain.updateMatrix();
        brain.matrixWorldNeedsUpdate = true;
    };

    // create 3js elements: scene, canvas, camera and controls; and init them and add skybox to the scene
    this.createCanvas = function () {
        scene = new THREE.Scene();
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            context: gl
        });
        camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / window.innerHeight, 0.001, 3000);
        initScene();
        console.log("createCanvas");
        addSkybox();
    };
    var controlMode = '';
    //toggle between control modes when 'c' is pressed
    this.toggleControlMode = function () {
        if (controlMode == '') {
            controls = new OrbitControls(camera, renderer.domElement);
            controlMode = 'orbit';
            console.log("controlMode: " + controlMode);
            return;
        }

        if (controlMode == 'orbit') {
            controls = new TrackballControls(camera, renderer.domElement);
            controlMode = 'trackball';
            console.log("controlMode: " + controlMode);
            return;
        }
        if (controlMode == 'trackball') {
            controls = new FlyControls(camera, renderer.domElement);
            controlMode = 'fly';
            console.log("controlMode: " + controlMode);
            return;
        }
        if (controlMode == 'fly') {
            controls = new FirstPersonControls(camera, renderer.domElement);
            controlMode = 'firstperson';
            console.log("controlMode: " + controlMode);
            return;
        }
        if (controlMode == 'firstperson') {
            controls = new ArcballControls(camera, renderer.domElement);
            controlMode = 'arcball';
            console.log("controlMode: " + controlMode);
            return;
        }
        if (controlMode == 'arcball') {
            controls = new TransformControls(camera, renderer.domElement);
            controlMode = 'transform';
            console.log("controlMode: " + controlMode);
            return;
        }
        if (controlMode == 'transform') {
            controls = new OrbitControls(camera, renderer.domElement);
            controlMode = 'orbit';
            console.log("controlMode: " + controlMode);
            return;
        }


    }

    //listen for key presses
    this.keyPress = function (event) {
        if (event.key == 'c') {
            console.log("toggle control mode");
            this.toggleControlMode();
        }
        if (event.key == 'r') {
            this.resetCamera();
        }
        if (event.key == 's') {
            this.resetBrainPosition();
        }
    }


    // initialize scene: init 3js scene, canvas, renderer and camera; add axis and light to the scene
    //todo is this sort of infinite recursion intentional?
    this.setEventListeners = function (onMouseDown, onMouseUp, onDocumentMouseMove) {
        canvas.addEventListener('mousedown', onMouseDown, true);
        canvas.addEventListener('mouseup', function (e) {
            onMouseUp(model, e);
        });
        canvas.addEventListener('mousemove', function (e) {
            onDocumentMouseMove(model, e);
        }, true);
    };

    // update node scale according to selection status
    this.updateNodeGeometry = function (nodeIndex, status) {
        var scale = 1.0;
        var dataset = model.getDataset();
        switch (status) {
            case 'normal':
                scale = 1.0;
                glyphs[nodeIndex].material.color = new THREE.Color(scaleColorGroup(model, dataset[nodeIndex].group));
                break;
            case 'mouseover':
                scale = 1.72;
                var delta = clock.getDelta();
                glyphs[nodeIndex].material.color = new THREE.Color((delta * 10.0), (1.0 - delta * 10.0), (0.5 + delta * 5.0));
                //console.log("Delta:" + (delta * 10.0 )) + " " + (1.0-delta * 10.0 ) + " " + (0.5 + delta * 5.0 );
                break;
            case 'selected':
                scale = (8 / 3);
                glyphs[nodeIndex].material.color = new THREE.Color(scaleColorGroup(model, dataset[nodeIndex].group));
                break;
            case 'root':
                scale = (10 / 3);
                glyphs[nodeIndex].material.color = new THREE.Color(scaleColorGroup(model, dataset[nodeIndex].group));
                break;
        }
        glyphs[nodeIndex].scale.set(scale, scale, scale);
    };

    this.updateNodesColor = function () {
        var dataset = model.getDataset();
        for (var i = 0; i < glyphs.length; ++i) {
            glyphs[i].material.color = new THREE.Color(scaleColorGroup(model, dataset[i].group));
        }
    };

    var removeNodesFromScene = function () {
        for (var i = 0; i < glyphs.length; ++i) {
            brain.remove(glyphs[i]);
            delete glyphNodeDictionary[glyphs[i].uuid];
        }
        glyphs = [];
    };

    this.removeEdgesFromScene = function () {
        for (var i = 0; i < displayedEdges.length; ++i) {
            brain.remove(displayedEdges[i]);
        }
        displayedEdges = [];

        this.removeShortestPathEdgesFromScene();
    };

    this.removeShortestPathEdgesFromScene = function () {
        for (var i = 0; i < shortestPathEdges.length; i++) {
            brain.remove(shortestPathEdges[i]);
        }
        shortestPathEdges = [];
    };
    var lastTime = 0;
    //   var fps = 240;
    //todo: add fps slider
    var animatePV = function () {
        //limit this function to (fps)fps)
        // if (Date.now() - lastTime < 1000 / fps) {
        //     return;
        // }
        // lastTime = Date.now();


        // if (enableVR && activateVR) {
        //     // if (oculusTouchExist) { //todo: Change old WebVR code to WebXR
        //     //     controllerLeft.update();
        //     //     controllerRight.update();
        scanOculusTouch();
        //     console.log("scanOculusTouch");
        //     // }
        //     //vrControl.update(); //todo: Change old WebVR code to WebXR
        //     console.log("vrControl.update()");
        // } else if (mobile && 0) {  // todo: get code to work and re-enable by deleting && 0
        //     if (gearVRControllerExist) {
        //         controllerRight.update();
        //         scanGearVRController();
        //         console.log("gearVRControllerExist");
        //     }
        //     //vrControl.update();  // todo: get code working then enable
        //     console.log("vrControl.update()");
        // } else {
        //calculate delta for controls


        //var clock = new THREE.Clock();
        var delta = clock.getDelta();


        //update controls
        if (controlMode !== 'transform') {
            controls.update(delta);
        } else {
            controls.update();
        }


        //update camera position
        camera.updateProjectionMatrix();

        //console.log("controls.update() called");


        if (enableRender)
            //changed from effect.render to renderer.render
            renderer.render(scene, camera);


        //effect.requestAnimationFrame(animatePV); //effect no longer has this function. Maybe it is no longer required

        //window.requestAnimationFrame(animatePV); // todo: this is the old way of doing it. Consider in WebXR
        renderer.setAnimationLoop(animatePV); // todo: this is the new way to do it in WebXR
    }

    this.requestAnimate = function () {
        //effect.requestAnimationFrame(animatePV); //effect no longer has this function. Maybe it is no longer required
        //window.requestAnimationFrame(animatePV);
        animatePV();
        // controls.update()
        // renderer.render(scene, camera);
        console.log("requestAnimate called");
    };

    this.enableRender = function (state) {
        enableRender = state;
    };

    this.isVRAvailable = function () {
        return enableVR;
    };

    // this.isPresenting = function () {
    //     vrButton.isPresenting();
    // };

    this.redrawEdges = function () {
        this.removeEdgesFromScene();
        if (getSpt())
            this.updateShortestPathEdges();
        this.drawConnections();
    };

    // determine if a region should be drawn
    var shouldDrawRegion = function (region) {
        return (model.isRegionActive(region.group) && atlas.getLabelVisibility(region.label));
    };

    // updating scenes: redrawing glyphs and displayed edges
    this.updateScene = function () {
        updateNodesPositions();
        this.updateNodesVisibility();
        this.redrawEdges();
    };

    // draw the brain regions as glyphs (the nodes)
    // assumes all nodes are visible, nothing is selected
    this.drawRegions = function () {
        var dataset = model.getDataset();

        // get geometry for each hemisphere
        var leftGeometry = getNormalGeometry('left');

        var rightGeometry = getNormalGeometry('right');

        // get material for each group
        var materialGroups = {};
        for (var i = 0; i < dataset.length; ++i) {
            if (!materialGroups[dataset[i].group]) {
                materialGroups[dataset[i].group] = new THREE.MeshLambertMaterial({
                    color: scaleColorGroup(model, dataset[i].group),
                    transparent: true,
                    opacity: 0.8
                });
            }
        }

        // count members of each group in each hemisphere
        var groupCounts = {};
        for (var i = 0; i < dataset.length; ++i) {
            if (!groupCounts[dataset[i].group]) {
                groupCounts[dataset[i].group] = {
                    left: 0,
                    right: 0
                };
            }
            groupCounts[dataset[i].group][dataset[i].hemisphere]++;
        }

        // create a resusable instanced mesh for each group in each hemisphere
        var instancedMeshes = {};
        for (var group in groupCounts) {
            instancedMeshes[group] = {};
            if (groupCounts[group].left > 0) {
                instancedMeshes[group].left = new THREE.InstancedMesh(leftGeometry, materialGroups[group], groupCounts[group].left);
            }
            if (groupCounts[group].right > 0) {
                instancedMeshes[group].right = new THREE.InstancedMesh(rightGeometry, materialGroups[group], groupCounts[group].right);
            }
        }

        // create matrix for each group in each hemisphere
        var matrices = {};
        for (var group in groupCounts) {
            matrices[group] = {};
            if (groupCounts[group].left > 0) {
                matrices[group].left = new THREE.Matrix4();
            }
            if (groupCounts[group].right > 0) {
                matrices[group].right = new THREE.Matrix4();
            }
        }

        // map data to instanced meshes
        var leftIndex = 0;
        var rightIndex = 0;
        for (var i = 0; i < dataset.length; ++i) {
            var region = dataset[i];
            var position = region.position;
            var group = region.group;
            var hemisphere = region.hemisphere;
            var matrix = matrices[group][hemisphere];
            matrix.setPosition(position.x, position.y, position.z);
            if (hemisphere === 'left') {
                instancedMeshes[group].left.setMatrixAt(leftIndex++, matrix);
            }
            else {
                instancedMeshes[group].right.setMatrixAt(rightIndex++, matrix);
            }
        }

        // add instanced meshes to brain
        for (var group in instancedMeshes) {
            if (instancedMeshes[group].left) {
                brain.add(instancedMeshes[group].left);
            }
            if (instancedMeshes[group].right) {
                brain.add(instancedMeshes[group].right);
            }
        }

        //
        // for (var i = 0; i < dataset.length; i++) {
        //     geometry = getNormalGeometry(dataset[i].hemisphere);
        //     material = getNormalMaterial(model, dataset[i].group);
        //     glyphs[i] = new THREE.Mesh(geometry, material);
        //     brain.add(glyphs[i]);
        //     glyphNodeDictionary[glyphs[i].uuid] = i;
        //     glyphs[i].position.set(dataset[i].position.x, dataset[i].position.y, dataset[i].position.z);
        //     glyphs[i].userData.hemisphere = dataset[i].hemisphere;
        // }
    };

// update the nodes positions according to the latest in the model
    var updateNodesPositions = function () {
        var dataset = model.getDataset();
        for (var i = 0; i < dataset.length; i++) {
            glyphs[i].position.set(dataset[i].position.x, dataset[i].position.y, dataset[i].position.z);
        }
    };

    this.updateNodesVisibility = function () {
        var dataset = model.getDataset();
        for (var i = 0; i < dataset.length; i++) {
            var opacity = 1.0;
            if (getRoot && getRoot == i) { // root node
                opacity = 1.0;
            }

            if (shouldDrawRegion(dataset[i])) {
                switch (model.getRegionState(dataset[i].group)) {
                    case 'active':
                        opacity = 1.0;
                        break;
                    case 'transparent':
                        opacity = 0.3;
                        break;
                    case 'inactive':
                        opacity = 0.0;
                        break;
                }
            } else {
                opacity = 0.0;
            }
            glyphs[i].material.opacity = opacity;
        }
    };


// draw all connections between the selected nodes, needs the connection matrix.
// don't draw edges belonging to inactive nodes
    this.drawConnections = function () {
        var nodeIdx;
        for (var i = 0; i < getNodesSelected().length; i++) {
            nodeIdx = getNodesSelected()[i];
            // draw only edges belonging to active nodes
            if (model.isRegionActive(model.getGroupNameByNodeIndex(nodeIdx))) {
                // two ways to draw edges
                if (getThresholdModality()) {
                    // 1) filter edges according to threshold
                    this.drawEdgesGivenNode(nodeIdx);
                } else {
                    // 2) draw top n edges connected to the selected node
                    this.drawTopNEdgesByNode(nodeIdx, model.getNumberOfEdges());
                }
            }
        }

        // draw all edges belonging to the shortest path array
        for (i = 0; i < shortestPathEdges.length; i++) {
            displayedEdges[displayedEdges.length] = shortestPathEdges[i];
            brain.add(shortestPathEdges[i]);
        }

        // setEdgesColor();
    };

// skew the color distribution according to the nodes strength
    var computeColorGradient = function (c1, c2, n, p) {
        var gradient = new Float32Array(n * 3);
        var p1 = p;
        var p2 = 1 - p1;
        for (var i = 0; i < n; ++i) {
            // skew the color distribution according to the nodes strength
            var r = i / (n - 1);
            var rr = (r * r * (p2 - 0.5) + r * (0.5 - p2 * p2)) / (p1 * p2);
            gradient[i * 3] = c2.r + (c1.r - c2.r) * rr;
            gradient[i * 3 + 1] = c2.g + (c1.g - c2.g) * rr;
            gradient[i * 3 + 2] = c2.b + (c1.b - c2.b) * rr
        }
        return gradient;
    };

// set the color of displayed edges
    this.updateEdgeColors = function () {
        var edge, c1, c2;
        for (var i = 0; i < displayedEdges.length; i++) {
            edge = displayedEdges[i];
            c1 = glyphs[edge.nodes[0]].material.color;
            c2 = glyphs[edge.nodes[1]].material.color;
            edge.geometry.setAttribute('color', new THREE.BufferAttribute(computeColorGradient(c1, c2, edge.nPoints, edge.p1), 3));
        }

        for (i = 0; i < shortestPathEdges.length; i++) {
            edge = displayedEdges[i];
            c1 = glyphs[edge.nodes[0]].material.color;
            c2 = glyphs[edge.nodes[1]].material.color;
            edge.geometry.setAttribute('color', new THREE.BufferAttribute(computeColorGradient(c1, c2, edge.nPoints, edge.p1), 3));
        }
    };

    this.updateEdgeOpacity = function (opacity) {
        var edgeOpacity = opacity;
        for (var i = 0; i < displayedEdges.length; i++) {
            displayedEdges[i].material.opacity = opacity;
        }
    };

// create a line using start and end points and give it a name
// TODO use this to allow different line sizes
// https://github.com/spite/THREE.MeshLine#create-a-threemeshline-and-assign-the-geometry
// geometry.vertices.push(end);
// var line = new THREE.MeshLine();
// line.setGeometry( geometry );
// material = new THREE.MeshLineMaterial();
// var mesh  = new THREE.Mesh(line.geometry, material);
    var createLine = function (edge, ownerNode, nodes) {
        var material = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: edgeOpacity,
            vertexColors: true //THREE.VertexColors
            // Due to limitations in the ANGLE layer on Windows platforms linewidth will always be 1.
        });

        var geometry = new THREE.BufferGeometry();
        var n = edge.length;

        var positions = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
            positions[i * 3] = edge[i].x;
            positions[i * 3 + 1] = edge[i].y;
            positions[i * 3 + 2] = edge[i].z;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        var s1 = model.getNodalStrength(nodes[0]), s2 = model.getNodalStrength(nodes[1]);
        var p1 = s1 / (s1 + s2);
        var c1 = new THREE.Color(scaleColorGroup(model, model.getGroupNameByNodeIndex(nodes[0]))),// glyphs[nodes[0]].material.color,
            c2 = new THREE.Color(scaleColorGroup(model, model.getGroupNameByNodeIndex(nodes[1])));// glyphs[nodes[1]].material.color;
        geometry.setAttribute('color', new THREE.BufferAttribute(computeColorGradient(c1, c2, n, p1), 3));

        // geometry.colors = colorGradient;
        var line = new THREE.Line(geometry, material);
        line.name = ownerNode;
        line.nPoints = n;
        line.nodes = nodes;
        line.p1 = p1;
        line.material.linewidth = 1;
        line.material.vertexColors = true; //THREE.VertexColors;

        return line;
    };

    var drawEdgeWithName = function (edge, ownerNode, nodes) {
        var line = createLine(edge, ownerNode, nodes);
        brain.add(line);
        return line;
    };

// draw the top n edges connected to a specific node
    this.drawTopNEdgesByNode = function (nodeIndex, n) {

        var row = model.getTopConnectionsByNode(nodeIndex, n);
        var edges = model.getActiveEdges();
        var edgeIdx = model.getEdgesIndeces();
        if (getEnableEB()) {
            model.performEBOnNode(nodeIndex);
        }
        for (var i = 0; i < row.length; ++i) {
            if ((nodeIndex != row[i]) && model.isRegionActive(model.getGroupNameByNodeIndex(i)) && getVisibleNodes(i)) {
                displayedEdges[displayedEdges.length] = drawEdgeWithName(edges[edgeIdx[nodeIndex][row[i]]], nodeIndex, [nodeIndex, row[i]]);
            }
        }

        // setEdgesColor();
    };

// draw edges given a node following edge threshold
    this.drawEdgesGivenNode = function (indexNode) {

        var row = model.getConnectionMatrixRow(indexNode);
        var edges = model.getActiveEdges();
        var edgeIdx = model.getEdgesIndeces();
        if (getEnableEB) {
            model.performEBOnNode(indexNode);
        }

        for (var i = 0; i < row.length; i++) {
            if ((i != indexNode) && Math.abs(row[i]) > model.getThreshold() && model.isRegionActive(model.getGroupNameByNodeIndex(i)) && getVisibleNodes(i)) {
                displayedEdges[displayedEdges.length] = drawEdgeWithName(edges[edgeIdx[indexNode][i]], indexNode, [indexNode, i]);
            }
        }
    };

// give a specific node index, remove all edges from a specific node in a specific scene
    this.removeEdgesGivenNode = function (indexNode) {
        var l = displayedEdges.length;

        // keep a list of removed edges indexes
        var removedEdges = [];
        for (var i = 0; i < l; i++) {
            var edge = displayedEdges[i];
            //removing only the edges that starts from that node
            if (edge.name == indexNode && shortestPathEdges.indexOf(edge) == -1) {
                removedEdges[removedEdges.length] = i;
                brain.remove(edge);
            }
        }

        // update the displayedEdges array
        var updatedDisplayEdges = [];
        for (i = 0; i < displayedEdges.length; i++) {
            //if the edge should not be removed
            if (removedEdges.indexOf(i) == -1) {
                updatedDisplayEdges[updatedDisplayEdges.length] = displayedEdges[i];
            }
        }

        for (i = 0; i < shortestPathEdges.length; i++) {
            updatedDisplayEdges[updatedDisplayEdges.length] = shortestPathEdges[i];
        }
        displayedEdges = updatedDisplayEdges;
    };

// draw skybox from images
    var addSkybox = function () {
        console.log("Adding skybox");
        var folder = 'darkgrid';
        var images = [
            './images/' + folder + '/negx.png',
            './images/' + folder + '/negy.png',
            './images/' + folder + '/negz.png',
            './images/' + folder + '/posx.png',
            './images/' + folder + '/posy.png',
            './images/' + folder + '/posz.png'
        ];
        //create skybox using images
        var skybox = new THREE.CubeTextureLoader().load(images);
        //set the scene background property with the resulting texture
        scene.background = skybox;
        //activate background
        scene.background.needsUpdate = true;
        //
        var geometry = new THREE.SphereGeometry(5000, 60, 40);
        geometry.scale(-1, 1, 1);
        var material = new THREE.MeshBasicMaterial({
            map: new THREE.TextureLoader().load('./images/' + folder + '/posy.png')
        });
        var mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
    }; // end addSkybox


// toggle skybox visibility
    this.setSkyboxVisibility = function (visible) {
        var results = scene.children.filter(function (d) {
            return d.name === "skybox"
        });
        var skybox = results[0];
        skybox.visible = visible;
    };

// draw a selected node: increase it's size
    this.drawSelectedNode = function (nodeIndex) {
        if (getNodesSelected().indexOf(nodeIndex) == -1) {
            setNodesSelected(getNodesSelected().length, nodeIndex);
        }
        this.updateNodeGeometry(nodeIndex, 'selected');
    };

// get intersected object beneath the mouse pointer
// detects which scene: left or right
// return undefined if no object was found
    this.getIntersectedObject = function (vector) {
        raycaster.setFromCamera(vector, camera);
        var objectsIntersected = raycaster.intersectObjects(glyphs);
        return (objectsIntersected[0]) ? objectsIntersected[0] : undefined;
    };

// callback when window is resized
    this.resizeScene = function () {
        //todo disabled for now straight to else  vrButton.isPresenting() ...  actually removing all WebVR for now
        // if (vrButton && 0) {
        //     camera.aspect = window.innerWidth / window.innerHeight;
        //     renderer.setSize(window.innerWidth, window.innerHeight);
        //     console.log("Resize for Mobile VR");
        // } else {
        camera.aspect = window.innerWidth / 2.0 / window.innerHeight;
        renderer.setSize(window.innerWidth / 2.0, window.innerHeight);
        console.log("Resize");
        //}
        camera.updateProjectionMatrix();
    };

// compute shortest path info for a node
    this.computeShortestPathForNode = function (nodeIndex) {
        console.log("Compute Shortest Path for node " + nodeIndex);
        setRoot(nodeIndex);
        model.computeShortestPathDistances(nodeIndex);
    };

// draw shortest path from root node up to a number of hops
    this.updateShortestPathBasedOnHops = function () {
        var hops = model.getNumberOfHops();
        var hierarchy = model.getHierarchy(getRoot);
        var edges = model.getActiveEdges();
        var edgeIdx = model.getEdgesIndeces();
        var previousMap = model.getPreviousMap();

        this.removeShortestPathEdgesFromScene();

        for (var i = 0; i < hierarchy.length; ++i) {
            if (i < hops + 1) {
                //Visible node branch
                for (var j = 0; j < hierarchy[i].length; j++) {
                    setVisibleNodes(hierarchy[i][j], true);
                    var prev = previousMap[hierarchy[i][j]];
                    if (prev) {
                        shortestPathEdges[shortestPathEdges.length] = createLine(edges[edgeIdx[prev][hierarchy[i][j]]], prev, [prev, i]);
                    }
                }
            } else {
                for (var j = 0; j < hierarchy[i].length; ++j) {
                    setVisibleNodes(hierarchy[i][j], false);
                }
            }
        }
    };

    this.updateShortestPathBasedOnDistance = function () {
        clrNodesSelected();
        this.removeShortestPathEdgesFromScene();

        // show only nodes with shortest paths distance less than a threshold
        var threshold = model.getDistanceThreshold() / 100. * model.getMaximumDistance();
        var distanceArray = model.getDistanceArray();
        for (var i = 0; i < getVisibleNodesLength(); i++) {
            setVisibleNodes(i, (distanceArray[i] <= threshold));
        }

        var edges = model.getActiveEdges();
        var edgeIdx = model.getEdgesIndeces();
        var previousMap = model.getPreviousMap();

        for (i = 0; i < getVisibleNodesLength(); ++i) {
            if (getVisibleNodes(i)) {
                var prev = previousMap[i];
                if (prev) {
                    shortestPathEdges[shortestPathEdges.length] = createLine(edges[edgeIdx[prev][i]], prev, [prev, i]);
                }
            }
        }
    };

    this.updateShortestPathEdges = function () {
        switch (getShortestPathVisMethod()) {
            case (SHORTEST_DISTANCE):
                this.updateShortestPathBasedOnDistance();
                break;
            case (NUMBER_HOPS):
                this.updateShortestPathBasedOnHops();
                break;
        }
    };

// prepares the shortest path from a = root to node b
    this.getShortestPathFromRootToNode = function (target) {
        this.removeShortestPathEdgesFromScene();

        var i = target;
        var prev; // previous node
        var edges = model.getActiveEdges();
        var edgeIdx = model.getEdgesIndeces();
        var previousMap = model.getPreviousMap();

        setVisibleNodes(getVisibleNodes().fill(true));
        while (previousMap[i] != null) {
            prev = previousMap[i];
            setVisibleNodes(prev, true);
            shortestPathEdges[shortestPathEdges.length] = createLine(edges[edgeIdx[prev][i]], prev, [prev, i]);
            i = prev;
        }

        this.drawConnections();
    };

// get intersected object pointed to by Vive/Touch Controller pointer
// return undefined if no object was found
    var getPointedObject = function (controller) {
        var controllerPosition = controller.position;
        var forwardVector = new THREE.Vector3(0, 0, -1);
        //get object in front of controller
        forwardVector.applyQuaternion(controller.quaternion);
        var raycaster = new THREE.Raycaster(controllerPosition, forwardVector);
        var objectsIntersected = raycaster.intersectObjects(glyphs);
        return (objectsIntersected[0]) ? objectsIntersected[0] : undefined;
    }

// // get the object pointed by the controller
// var getPointedObject = function (controller) {
//     var raycaster = new THREE.Raycaster();
//     //raycaster from controller
//     raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
//     //raycaster.setFromCamera({x: 0, y: 0}, camera);
//     var intersects = raycaster.intersectObjects(brain.children, true);
//     if (intersects.length > 0) {
//         return intersects[0].object;
//     }
//     return null;
// }


// Update the text and position according to selected node
// The alignment, size and offset parameters are set by experimentation
// TODO needs more experimentation
    this.updateNodeLabel = function (text, nodeIndex) {
        var context = nspCanvas.getContext('2d');
        context.textAlign = 'left';
        context.clearRect(0, 0, 256 * 4, 256);
        context.fillText(text, 5, 120);

        nodeNameMap.needsUpdate = true;
        var pos = glyphs[nodeIndex].position;
        nodeLabelSprite.position.set(pos.x, pos.y, pos.z);
        nodeLabelSprite.needsUpdate = true;
    };

// Adding Node label Sprite
    var addNodeLabel = function () {

        nspCanvas = document.createElement('canvas');
        var size = 256;
        nspCanvas.width = size * 4;
        nspCanvas.height = size;
        var context = nspCanvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.textAlign = 'left';
        context.font = '24px Arial';
        context.fillText("", 0, 0);

        nodeNameMap = new THREE.Texture(nspCanvas);
        nodeNameMap.needsUpdate = true;

        var mat = new THREE.SpriteMaterial({
            map: nodeNameMap,
            transparent: true,
            useScreenCoordinates: false,
            color: 0xffffff
        });

        nodeLabelSprite = new THREE.Sprite(mat);
        nodeLabelSprite.scale.set(100, 50, 1);
        nodeLabelSprite.position.set(0, 0, 0);
        brain.add(nodeLabelSprite);
    };

    this.getCamera = function () {
        return camera;
    };

    this.syncCameraWith = function (cam) {
        camera.copy(cam);
        camera.position.copy(cam.position);
        camera.zoom = cam.zoom;
    };


// PreviewArea construction
    this.createCanvas();
    this.initXR();
    this.drawRegions();
}

export {PreviewArea}