import { View, type ViewProps } from 'react-native';

class StubMediaStreamTrack {
  enabled = true;
  kind = 'audio';
  id = 'stub-track';
  stop() {}
}

class StubMediaStream {
  id = 'stub-stream';
  private tracks: StubMediaStreamTrack[];

  constructor(tracks: StubMediaStreamTrack[] = []) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  toURL() {
    return '';
  }
}

class StubRTCPeerConnection {
  iceGatheringState: 'new' | 'gathering' | 'complete' = 'complete';
  connectionState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed' = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;

  addTrack() {}
  close() {
    this.connectionState = 'closed';
  }

  async createOffer() {
    return { type: 'offer', sdp: 'v=0\r\n' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'v=0\r\n' };
  }

  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description;
    this.iceGatheringState = 'complete';
  }

  async setRemoteDescription() {}
}

class StubRTCSessionDescription {
  type: string;
  sdp: string;
  constructor(init: { type: string; sdp: string }) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
}

const mediaDevices = {
  async getUserMedia() {
    throw new Error('WhatsApp calling requires a custom Expo development build with WebRTC. Expo Go is not supported.');
  },
};

function RTCView(_props: ViewProps & { streamURL?: string; objectFit?: string }) {
  return <View />;
}

export {
  mediaDevices,
  StubMediaStream as MediaStream,
  StubMediaStreamTrack as MediaStreamTrack,
  StubRTCPeerConnection as RTCPeerConnection,
  StubRTCSessionDescription as RTCSessionDescription,
  RTCView,
};
