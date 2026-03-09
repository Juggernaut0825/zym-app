#!/bin/bash
rm -rf ZYM.xcodeproj
mkdir -p ZYM.xcodeproj

cat > ZYM.xcodeproj/project.pbxproj << 'PBXEOF'
// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {};
	objectVersion = 56;
	objects = {
		A1 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ZYMApp.swift; sourceTree = "<group>"; };
		A2 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppState.swift; sourceTree = "<group>"; };
		B1 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = LoginView.swift; sourceTree = "<group>"; };
		B2 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = RegisterView.swift; sourceTree = "<group>"; };
		B3 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CoachSelectView.swift; sourceTree = "<group>"; };
		B4 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ChatView.swift; sourceTree = "<group>"; };
		B5 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = FeedView.swift; sourceTree = "<group>"; };
		B6 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ProfileView.swift; sourceTree = "<group>"; };
		B7 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = MainTabView.swift; sourceTree = "<group>"; };
		C1 = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ZYM.app; sourceTree = BUILT_PRODUCTS_DIR; };
		G1 = {isa = PBXGroup; children = (A1,A2,G2); path = ZYM; sourceTree = "<group>"; };
		G2 = {isa = PBXGroup; children = (B1,B2,B3,B4,B5,B6,B7); path = Views; sourceTree = "<group>"; };
		G3 = {isa = PBXGroup; children = (C1); name = Products; sourceTree = "<group>"; };
		G4 = {isa = PBXGroup; children = (G1,G3); sourceTree = "<group>"; };
		T1 = {isa = PBXNativeTarget; buildConfigurationList = L1; buildPhases = (P1,P2,P3); buildRules = (); dependencies = (); name = ZYM; productName = ZYM; productReference = C1; productType = "com.apple.product-type.application"; };
		P1 = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (F1,F2,F3,F4,F5,F6,F7,F8,F9); runOnlyForDeploymentPostprocessing = 0; };
		P2 = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		P3 = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		L1 = {isa = XCConfigurationList; buildConfigurations = (C2,C3); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		C2 = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_IDENTITY = ""; CODE_SIGN_STYLE = Manual; INFOPLIST_FILE = ZYM/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 16.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Debug; };
		C3 = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_IDENTITY = ""; CODE_SIGN_STYLE = Manual; INFOPLIST_FILE = ZYM/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 16.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Release; };
		L2 = {isa = XCConfigurationList; buildConfigurations = (C4,C5); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		C4 = {isa = XCBuildConfiguration; buildSettings = {IPHONEOS_DEPLOYMENT_TARGET = 16.0; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; }; name = Debug; };
		C5 = {isa = XCBuildConfiguration; buildSettings = {IPHONEOS_DEPLOYMENT_TARGET = 16.0; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; }; name = Release; };
		F1 = {isa = PBXBuildFile; fileRef = A1; };
		F2 = {isa = PBXBuildFile; fileRef = A2; };
		F3 = {isa = PBXBuildFile; fileRef = B1; };
		F4 = {isa = PBXBuildFile; fileRef = B2; };
		F5 = {isa = PBXBuildFile; fileRef = B3; };
		F6 = {isa = PBXBuildFile; fileRef = B4; };
		F7 = {isa = PBXBuildFile; fileRef = B5; };
		F8 = {isa = PBXBuildFile; fileRef = B6; };
		F9 = {isa = PBXBuildFile; fileRef = B7; };
		R1 = {isa = PBXProject; buildConfigurationList = L2; mainGroup = G4; productRefGroup = G3; targets = (T1); };
	};
	rootObject = R1;
}
PBXEOF

echo "Xcode project rebuilt"
