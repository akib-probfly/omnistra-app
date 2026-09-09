import AVFoundation
import ExpoModulesCore
import WebRTC

public class ZurvisCallAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZurvisCallAudio")

    OnCreate {
      Self.installWebRtcDefaults()
    }

    AsyncFunction("activate") { (speaker: Bool) in
      try Self.applySession(speaker: speaker)
    }.runOnQueue(.main)

    AsyncFunction("setSpeaker") { (speaker: Bool) in
      try Self.overrideSpeaker(speaker)
    }.runOnQueue(.main)

    AsyncFunction("deactivate") {
      Self.releaseSession()
    }.runOnQueue(.main)
  }

  private static func installWebRtcDefaults() {
    let config = RTCAudioSessionConfiguration.webRTC()
    config.category = AVAudioSession.Category.playAndRecord.rawValue
    config.mode = AVAudioSession.Mode.voiceChat.rawValue
    config.categoryOptions = categoryOptions()
    RTCAudioSessionConfiguration.setWebRTC(config)
    RTCAudioSession.sharedInstance().useManualAudio = true
  }

  private static func categoryOptions() -> AVAudioSession.CategoryOptions {
    // No .defaultToSpeaker — calls start on the earpiece by default.
    // Speaker is enabled only via overrideOutputAudioPort(.speaker).
    var options: AVAudioSession.CategoryOptions = []
#if compiler(>=6.2)
    options.insert(.allowBluetoothHFP)
#else
    options.insert(.allowBluetooth)
#endif
    options.insert(.allowBluetoothA2DP)
    return options
  }

  private static func applySession(speaker: Bool) throws {
    // NOTE: do not reset RTCAudioSessionConfiguration here — it is installed once
    // in OnCreate. Re-setting it while a call is active can glitch iOS audio.
    let session = AVAudioSession.sharedInstance()
    // The ringtone/voice-note session may still be active in playback mode.
    // iOS will not reliably switch to PlayAndRecord without deactivating first
    // (Android has no such constraint, which is why Android worked).
    try? session.setActive(false, options: .notifyOthersOnDeactivation)
    try session.setCategory(.playAndRecord, mode: .voiceChat, options: categoryOptions())
    try session.setActive(true, options: [])
    RTCAudioSession.sharedInstance().audioSessionDidActivate(session)
    // With useManualAudio = true WebRTC never starts capture/render on its own.
    // Without this there is no mic or remote audio on iOS (Android is unaffected).
    RTCAudioSession.sharedInstance().isAudioEnabled = true
    try overrideSpeaker(speaker)
  }

  private static func overrideSpeaker(_ speaker: Bool) throws {
    // Re-assert audio enabled so a speaker toggle after an interruption restores sound.
    RTCAudioSession.sharedInstance().isAudioEnabled = true
    try AVAudioSession.sharedInstance().overrideOutputAudioPort(speaker ? .speaker : .none)
  }

  private static func releaseSession() {
    let session = AVAudioSession.sharedInstance()
    RTCAudioSession.sharedInstance().isAudioEnabled = false
    RTCAudioSession.sharedInstance().audioSessionDidDeactivate(session)
    try? session.overrideOutputAudioPort(.none)
    try? session.setActive(false, options: .notifyOthersOnDeactivation)
  }
}
