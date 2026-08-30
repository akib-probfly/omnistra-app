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
    let config = RTCAudioSessionConfiguration.webRTCConfiguration()
    config.category = AVAudioSession.Category.playAndRecord.rawValue
    config.mode = AVAudioSession.Mode.videoChat.rawValue
    config.categoryOptions = categoryOptions()
    RTCAudioSessionConfiguration.setWebRTCConfiguration(config)
    RTCAudioSession.sharedInstance().useManualAudio = true
  }

  private static func categoryOptions() -> AVAudioSession.CategoryOptions {
    var options: AVAudioSession.CategoryOptions = [.defaultToSpeaker]
#if compiler(>=6.2)
    options.insert(.allowBluetoothHFP)
#else
    options.insert(.allowBluetooth)
#endif
    options.insert(.allowBluetoothA2DP)
    return options
  }

  private static func applySession(speaker: Bool) throws {
    installWebRtcDefaults()

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .videoChat, options: categoryOptions())
    try session.setActive(true)
    RTCAudioSession.sharedInstance().audioSessionDidActivate(session)
    try overrideSpeaker(speaker)
  }

  private static func overrideSpeaker(_ speaker: Bool) throws {
    try AVAudioSession.sharedInstance().overrideOutputAudioPort(speaker ? .speaker : .none)
  }

  private static func releaseSession() {
    let session = AVAudioSession.sharedInstance()
    RTCAudioSession.sharedInstance().audioSessionDidDeactivate(session)
    try? session.overrideOutputAudioPort(.none)
  }
}
