Pod::Spec.new do |s|
  s.name           = 'HttpCookies'
  s.version        = '1.0.0'
  s.summary        = 'Lists and removes cookies in the app shared HTTP cookie store'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Alexander Pominov'
  s.homepage       = 'https://github.com/alex-pominov/just-calorie'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
