import AVFoundation
import ExpoModulesCore
import WebRTC

public class ZurvisCallAudioModule: Module {
  private static var ownsActivation = false
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
    return options
  }

  private static func applySession(speaker: Bool) throws {
    let rtc = RTCAudioSession.sharedInstance()
    rtc.lockForConfiguration()
    defer { rtc.unlockForConfiguration() }
    try rtc.setCategory(AVAudioSession.Category.playAndRecord.rawValue,
                        with: categoryOptions())
    try rtc.setMode(AVAudioSession.Mode.voiceChat.rawValue)
    // Acquire exactly one activation. Reapply must not interrupt a running audio
    // unit or increment WebRTC's activation counter on every connection event.
    if !ownsActivation {
      try rtc.setActive(true)
      ownsActivation = true
    }
    rtc.isAudioEnabled = true
    try rtc.overrideOutputAudioPort(speaker ? .speaker : .none)
  }

  private static func overrideSpeaker(_ speaker: Bool) throws {
    guard ownsActivation else { return }
    try applySession(speaker: speaker)
  }

  private static func releaseSession() {
    guard ownsActivation else { return }
    let rtc = RTCAudioSession.sharedInstance()
    rtc.lockForConfiguration()
    defer { rtc.unlockForConfiguration() }
    rtc.isAudioEnabled = false
    try? rtc.overrideOutputAudioPort(.none)
    try? rtc.setActive(false)
    ownsActivation = false
  }
}
