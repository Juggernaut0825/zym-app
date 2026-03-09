require 'xcodeproj'
project = Xcodeproj::Project.open('ZYM.xcodeproj')
target = project.targets.first
views_group = project.main_group.find_subpath('ZYM/Views')

['InboxView.swift', 'ConversationView.swift', 'CreatePostView.swift', 'FriendsView.swift', 'CreateGroupView.swift'].each do |filename|
  path = "ZYM/Views/#{filename}"
  file_ref = views_group.new_file(path)
  target.add_file_references([file_ref])
end

project.save
