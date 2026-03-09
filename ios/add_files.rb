require 'xcodeproj'
project = Xcodeproj::Project.open('ZYM.xcodeproj')
target = project.targets.first

group = project.main_group.new_group('ZYM')
views_group = group.new_group('Views')
services_group = group.new_group('Services')

files = {
  'ZYM/ZYMApp.swift' => group,
  'ZYM/AppState.swift' => group,
  'ZYM/Info.plist' => group,
  'ZYM/Views/LoginView.swift' => views_group,
  'ZYM/Views/RegisterView.swift' => views_group,
  'ZYM/Views/CoachSelectView.swift' => views_group,
  'ZYM/Views/ChatView.swift' => views_group,
  'ZYM/Views/FeedView.swift' => views_group,
  'ZYM/Views/ProfileView.swift' => views_group,
  'ZYM/Views/MainTabView.swift' => views_group,
  'ZYM/Services/WebSocketManager.swift' => services_group
}

files.each do |path, grp|
  file_ref = grp.new_file(path)
  target.add_file_references([file_ref]) if path.end_with?('.swift')
end

target.build_configurations.each do |config|
  config.build_settings['INFOPLIST_FILE'] = 'ZYM/Info.plist'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.zym.app'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['SWIFT_VERSION'] = '5.0'
end

project.save
