require 'xcodeproj'
project = Xcodeproj::Project.new('ZYM.xcodeproj')
target = project.new_target(:application, 'ZYM', :ios, '17.0')
project.save
