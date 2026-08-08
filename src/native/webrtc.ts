import { NativeModules } from 'react-native';

/* eslint-disable @typescript-eslint/no-explicit-any */

function loadWebRtc(): any {
  // Expo Go and any build without the native WebRTC binary stay on the stub.
  if (NativeModules.WebRTCModule == null) {
    return require('./webrtc-stub');
  }

  try {
    // Only resolved in custom/dev-client builds (see metro.config.js).
    return require('react-native-webrtc/lib/commonjs/index.js');
  } catch {
    return require('./webrtc-stub');
  }
}

const webRtc = loadWebRtc();

export const mediaDevices = webRtc.mediaDevices as any;
export const MediaStream = webRtc.MediaStream as any;
export const MediaStreamTrack = webRtc.MediaStreamTrack as any;
export const RTCPeerConnection = webRtc.RTCPeerConnection as any;
export const RTCSessionDescription = webRtc.RTCSessionDescription as any;
export const RTCView = webRtc.RTCView as any;

export type MediaStream = any;
export type MediaStreamTrack = any;
export type RTCPeerConnection = any;
export type RTCSessionDescription = any;
