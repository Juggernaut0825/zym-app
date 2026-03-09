#!/bin/bash
mkdir -p ZYM.xcodeproj
cat > ZYM.xcodeproj/project.pbxproj << 'PROJ'
// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {};
	objectVersion = 56;
	objects = {
		F1 = {isa = PBXFileReference; path = ZYMApp.swift; sourceTree = "<group>"; };
		F2 = {isa = PBXFileReference; path = AppState.swift; sourceTree = "<group>"; };
		F3 = {isa = PBXFileReference; path = LoginView.swift; sourceTree = "<group>"; };
		F4 = {isa = PBXFileReference; path = RegisterView.swift; sourceTree = "<group>"; };
		F5 = {isa = PBXFileReference; path = CoachSelectView.swift; sourceTree = "<group>"; };
		F6 = {isa = PBXFileReference; path = ChatView.swift; sourceTree = "<group>"; };
		F7 = {isa = PBXFileReference; path = FeedView.swift; sourceTree = "<group>"; };
		F8 = {isa = PBXFileReference; path = ProfileView.swift; sourceTree = "<group>"; };
		F9 = {isa = PBXFileReference; path = MainTabView.swift; sourceTree = "<group>"; };
		F10 = {isa = PBXFileReference; path = WebSocketManager.swift; sourceTree = "<group>"; };
		F11 = {isa = PBXFileReference; path = Info.plist; sourceTree = "<group>"; };
		G1 = {isa = PBXGroup; children = (F1,F2,G2,G3,F11); path = ZYM; sourceTree = "<group>"; };
		G2 = {isa = PBXGroup; children = (F3,F4,F5,F6,F7,F8,F9); path = Views; sourceTree = "<group>"; };
		G3 = {isa = PBXGroup; children = (F10); path = Services; sourceTree = "<group>"; };
		G4 = {isa = PBXGroup; children = (G1); sourceTree = "<group>"; };
		T1 = {isa = PBXNativeTarget; buildConfigurationList = CL1; buildPhases = (BP1,BP2,BP3); buildRules = (); dependencies = (); name = ZYM; productName = ZYM; productReference = PR1; productType = "com.apple.product-type.application"; };
		CL1 = {isa = XCConfigurationList; buildConfigurations = (BC1,BC2); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		BP1 = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (BF1,BF2,BF3,BF4,BF5,BF6,BF7,BF8,BF9,BF10); runOnlyForDeploymentPostprocessing = 0; };
		BP2 = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		BP3 = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		PR1 = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ZYM.app; sourceTree = BUILT_PRODUCTS_DIR; };
		BC1 = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; INFOPLIST_FILE = ZYM/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 17.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Debug; };
		BC2 = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; INFOPLIST_FILE = ZYM/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 17.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Release; };
		BF1 = {isa = PBXBuildFile; fileRef = F1; };
		BF2 = {isa = PBXBuildFile; fileRef = F2; };
		BF3 = {isa = PBXBuildFile; fileRef = F3; };
		BF4 = {isa = PBXBuildFile; fileRef = F4; };
		BF5 = {isa = PBXBuildFile; fileRef = F5; };
		BF6 = {isa = PBXBuildFile; fileRef = F6; };
		BF7 = {isa = PBXBuildFile; fileRef = F7; };
		BF8 = {isa = PBXBuildFile; fileRef = F8; };
		BF9 = {isa = PBXBuildFile; fileRef = F9; };
		BF10 = {isa = PBXBuildFile; fileRef = F10; };
	};
	rootObject = P1;
	P1 = {isa = PBXProject; buildConfigurationList = CL2; compatibilityVersion = "Xcode 14.0"; mainGroup = G4; productRefGroup = PG1; targets = (T1); };
	CL2 = {isa = XCConfigurationList; buildConfigurations = (BC3,BC4); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
	PG1 = {isa = PBXGroup; children = (PR1); name = Products; sourceTree = "<group>"; };
	BC3 = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ENABLE_OBJC_ARC = YES; SWIFT_VERSION = 5.0; }; name = Debug; };
	BC4 = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ENABLE_OBJC_ARC = YES; SWIFT_VERSION = 5.0; }; name = Release; };
}
PROJ
echo "Created ZYM.xcodeproj"
