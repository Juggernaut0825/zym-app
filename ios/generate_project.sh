#!/bin/bash
rm -rf ZYM.xcodeproj

cat > project.pbxproj.template << 'PBXPROJ'
// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {
		A1000001000000000000001 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ZYMApp.swift; sourceTree = "<group>"; };
		A1000001000000000000002 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppState.swift; sourceTree = "<group>"; };
		A1000001000000000000003 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = LoginView.swift; sourceTree = "<group>"; };
		A1000001000000000000004 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = RegisterView.swift; sourceTree = "<group>"; };
		A1000001000000000000005 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CoachSelectView.swift; sourceTree = "<group>"; };
		A1000001000000000000006 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ChatView.swift; sourceTree = "<group>"; };
		A1000001000000000000007 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = FeedView.swift; sourceTree = "<group>"; };
		A1000001000000000000008 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ProfileView.swift; sourceTree = "<group>"; };
		A1000001000000000000009 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = MainTabView.swift; sourceTree = "<group>"; };
		A1000001000000000000010 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = WebSocketManager.swift; sourceTree = "<group>"; };
		A1000001000000000000011 = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
		A100000100000000000000A = {isa = PBXGroup; children = (A1000001000000000000001,A1000001000000000000002,A100000100000000000000B,A100000100000000000000C,A1000001000000000000011,); path = ZYM; sourceTree = "<group>"; };
		A100000100000000000000B = {isa = PBXGroup; children = (A1000001000000000000003,A1000001000000000000004,A1000001000000000000005,A1000001000000000000006,A1000001000000000000007,A1000001000000000000008,A1000001000000000000009,); path = Views; sourceTree = "<group>"; };
		A100000100000000000000C = {isa = PBXGroup; children = (A1000001000000000000010,); path = Services; sourceTree = "<group>"; };
		A100000100000000000000D = {isa = PBXGroup; children = (A100000100000000000000A,); sourceTree = "<group>"; };
		A100000100000000000000E = {isa = PBXNativeTarget; buildConfigurationList = A1000001000000000000013; buildPhases = (A1000001000000000000014,A1000001000000000000015,A1000001000000000000016); buildRules = (); dependencies = (); name = ZYM; productName = ZYM; productReference = A1000001000000000000017; productType = "com.apple.product-type.application"; };
		A1000001000000000000013 = {isa = XCConfigurationList; buildConfigurations = (A1000001000000000000018,A1000001000000000000019); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		A1000001000000000000014 = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (A1000001000000000000020,A1000001000000000000021,A1000001000000000000022,A1000001000000000000023,A1000001000000000000024,A1000001000000000000025,A1000001000000000000026,A1000001000000000000027,A1000001000000000000028,A1000001000000000000029); runOnlyForDeploymentPostprocessing = 0; };
		A1000001000000000000015 = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		A1000001000000000000016 = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		A1000001000000000000017 = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ZYM.app; sourceTree = BUILT_PRODUCTS_DIR; };
		A1000001000000000000018 = {isa = XCBuildConfiguration; buildSettings = {ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; DEVELOPMENT_TEAM = ""; INFOPLIST_FILE = ZYM/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 17.0; LD_RUNPATH_SEARCH_PATHS = ("$(inherited)", "@executable_path/Frameworks"); MARKETING_VERSION = 1.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Debug; };
		A1000001000000000000019 = {isa = XCBuildConfiguration; buildSettings = {ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; DEVELOPMENT_TEAM = ""; INFOPLIST_FILE = ZYM/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 17.0; LD_RUNPATH_SEARCH_PATHS = ("$(inherited)", "@executable_path/Frameworks"); MARKETING_VERSION = 1.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Release; };
		A1000001000000000000020 = {isa = PBXBuildFile; fileRef = A1000001000000000000001; };
		A1000001000000000000021 = {isa = PBXBuildFile; fileRef = A1000001000000000000002; };
		A1000001000000000000022 = {isa = PBXBuildFile; fileRef = A1000001000000000000003; };
		A1000001000000000000023 = {isa = PBXBuildFile; fileRef = A1000001000000000000004; };
		A1000001000000000000024 = {isa = PBXBuildFile; fileRef = A1000001000000000000005; };
		A1000001000000000000025 = {isa = PBXBuildFile; fileRef = A1000001000000000000006; };
		A1000001000000000000026 = {isa = PBXBuildFile; fileRef = A1000001000000000000007; };
		A1000001000000000000027 = {isa = PBXBuildFile; fileRef = A1000001000000000000008; };
		A1000001000000000000028 = {isa = PBXBuildFile; fileRef = A1000001000000000000009; };
		A1000001000000000000029 = {isa = PBXBuildFile; fileRef = A1000001000000000000010; };
	};
	rootObject = A100000100000000000000F;
	A100000100000000000000F = {isa = PBXProject; attributes = {LastSwiftUpdateCheck = 1500; LastUpgradeCheck = 1500; TargetAttributes = {A100000100000000000000E = {CreatedOnToolsVersion = 15.0;};};}; buildConfigurationList = A1000001000000000000012; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base); mainGroup = A100000100000000000000D; productRefGroup = A1000001000000000000030; projectDirPath = ""; projectRoot = ""; targets = (A100000100000000000000E); };
	A1000001000000000000012 = {isa = XCConfigurationList; buildConfigurations = (A1000001000000000000031,A1000001000000000000032); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
	A1000001000000000000030 = {isa = PBXGroup; children = (A1000001000000000000017); name = Products; sourceTree = "<group>"; };
	A1000001000000000000031 = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ANALYZER_NONNULL = YES; CLANG_CXX_LANGUAGE_STANDARD = "gnu++20"; CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; COPY_PHASE_STRIP = NO; DEBUG_INFORMATION_FORMAT = dwarf; ENABLE_STRICT_OBJC_MSGSEND = YES; ENABLE_TESTABILITY = YES; GCC_C_LANGUAGE_STANDARD = gnu11; GCC_DYNAMIC_NO_PIC = NO; GCC_NO_COMMON_BLOCKS = YES; GCC_OPTIMIZATION_LEVEL = 0; GCC_PREPROCESSOR_DEFINITIONS = ("DEBUG=1", "$(inherited)"); GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR; GCC_WARN_UNDECLARED_SELECTOR = YES; GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE; GCC_WARN_UNUSED_FUNCTION = YES; GCC_WARN_UNUSED_VARIABLE = YES; MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE; MTL_FAST_MATH = YES; ONLY_ACTIVE_ARCH = YES; SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; SWIFT_OPTIMIZATION_LEVEL = "-Onone"; }; name = Debug; };
	A1000001000000000000032 = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ANALYZER_NONNULL = YES; CLANG_CXX_LANGUAGE_STANDARD = "gnu++20"; CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; COPY_PHASE_STRIP = NO; DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"; ENABLE_NS_ASSERTIONS = NO; ENABLE_STRICT_OBJC_MSGSEND = YES; GCC_C_LANGUAGE_STANDARD = gnu11; GCC_NO_COMMON_BLOCKS = YES; GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR; GCC_WARN_UNDECLARED_SELECTOR = YES; GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE; GCC_WARN_UNUSED_FUNCTION = YES; GCC_WARN_UNUSED_VARIABLE = YES; MTL_ENABLE_DEBUG_INFO = NO; MTL_FAST_MATH = YES; SWIFT_COMPILATION_MODE = wholemodule; SWIFT_OPTIMIZATION_LEVEL = "-O"; }; name = Release; };
}
PBXPROJ

mkdir -p ZYM.xcodeproj
mv project.pbxproj.template ZYM.xcodeproj/project.pbxproj
echo "Xcode project generated"
