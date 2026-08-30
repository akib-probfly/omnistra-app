Pod::Spec.new do |s|
  s.name           = 'ZurvisCallAudio'
  s.version        = '1.0.0'
  s.summary        = 'iOS AVAudioSession control for WhatsApp WebRTC calls'
  s.description    = 'Routes WhatsApp call audio to the speaker and keeps PlayAndRecord active on iOS.'
  s.license        = 'UNLICENSED'
  s.author         = 'Zurvis'
  s.homepage       = 'https://zurvis.io'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'JitsiWebRTC', '~> 124.0.0'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  s.source_files = '*.{h,m,mm,swift}'
end
