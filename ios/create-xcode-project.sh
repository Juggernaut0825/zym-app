#!/bin/bash

# Create Xcode project structure
mkdir -p ZYM.xcodeproj

# Create project.pbxproj
cat > ZYM.xcodeproj/project.pbxproj << 'EOF'
// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {
		A1000001 /* ZYMApp.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ZYMApp.swift; sourceTree = "<group>"; };
		A1000002 /* ContentView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ContentView.swift; sourceTree = "<group>"; };
		A1000003 /* CoachChatView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CoachChatView.swift; sourceTree = "<group>"; };
		A1000004 /* FeedView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = FeedView.swift; sourceTree = "<group>"; };
		A1000005 /* ProfileView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ProfileView.swift; sourceTree = "<group>"; };
		A1000006 /* WebSocketManager.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = WebSocketManager.swift; sourceTree = "<group>"; };
		A1000007 /* HealthKitManager.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = HealthKitManager.swift; sourceTree = "<group>"; };
		A1000010 /* ZYM.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ZYM.app; sourceTree = BUILT_PRODUCTS_DIR; };
		A1000020 /* Views */ = {isa = PBXGroup; children = (A1000002,A1000003,A1000004,A1000005); path = Views; sourceTree = "<group>"; };
		A1000021 /* Services */ = {isa = PBXGroup; children = (A1000006,A1000007); path = Services; sourceTree = "<group>"; };
		A1000030 /* ZYM */ = {isa = PBXGroup; children = (A1000001,A1000020,A1000021); path = ZYM; sourceTree = "<group>"; };
		A1000031 /* Products */ = {isa = PBXGroup; children = (A1000010); name = Products; sourceTree = "<group>"; };
		A1000040 = {isa = PBXGroup; children = (A1000030,A1000031); sourceTree = "<group>"; };
		A1000050 /* ZYM */ = {isa = PBXNativeTarget; buildConfigurationList = A1000060; buildPhases = (A1000051,A1000052,A1000053); buildRules = (); dependencies = (); name = ZYM; productName = ZYM; productReference = A1000010; productType = "com.apple.product-type.application"; };
		A1000051 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (A1100001,A1100002,A1100003,A1100004,A1100005,A1100006,A1100007); runOnlyForDeploymentPostprocessing = 0; };
		A1000052 /* Frameworks */ = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		A1000053 /* Resources */ = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		A1000060 /* Build configuration list for PBXNativeTarget "ZYM" */ = {isa = XCConfigurationList; buildConfigurations = (A1000061,A1000062); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		A1000061 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = {ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; DEVELOPMENT_TEAM = ""; INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES; INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES; INFOPLIST_KEY_UILaunchScreen_Generation = YES; INFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight"; IPHONEOS_DEPLOYMENT_TARGET = 16.0; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks"; MARKETING_VERSION = 1.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SWIFT_EMIT_LOC_STRINGS = YES; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Debug; };
		A1000062 /* Release */ = {isa = XCBuildConfiguration; buildSettings = {ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; DEVELOPMENT_TEAM = ""; INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES; INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES; INFOPLIST_KEY_UILaunchScreen_Generation = YES; INFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight"; IPHONEOS_DEPLOYMENT_TARGET = 16.0; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks"; MARKETING_VERSION = 1.0; PRODUCT_BUNDLE_IDENTIFIER = com.zym.app; PRODUCT_NAME = "$(TARGET_NAME)"; SWIFT_EMIT_LOC_STRINGS = YES; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Release; };
		A1000070 /* Build configuration list for PBXProject "ZYM" */ = {isa = XCConfigurationList; buildConfigurations = (A1000071,A1000072); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		A1000071 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ANALYZER_NONNULL = YES; CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE; CLANG_CXX_LANGUAGE_STANDARD = "gnu++20"; CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; CLANG_ENABLE_OBJC_WEAK = YES; CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES; CLANG_WARN_BOOL_CONVERSION = YES; CLANG_WARN_COMMA = YES; CLANG_WARN_CONSTANT_CONVERSION = YES; CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES; CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR; CLANG_WARN_DOCUMENTATION_COMMENTS = YES; CLANG_WARN_EMPTY_BODY = YES; CLANG_WARN_ENUM_CONVERSION = YES; CLANG_WARN_INFINITE_RECURSION = YES; CLANG_WARN_INT_CONVERSION = YES; CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES; CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES; CLANG_WARN_OBJC_LITERAL_CONVERSION = YES; CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR; CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES; CLANG_WARN_RANGE_LOOP_ANALYSIS = YES; CLANG_WARN_STRICT_PROTOTYPES = YES; CLANG_WARN_SUSPICIOUS_MOVE = YES; CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE; CLANG_WARN_UNREACHABLE_CODE = YES; CLANG_WARN__DUPLICATE_METHOD_MATCH = YES; COPY_PHASE_STRIP = NO; DEBUG_INFORMATION_FORMAT = dwarf; ENABLE_STRICT_OBJC_MSGSEND = YES; ENABLE_TESTABILITY = YES; GCC_C_LANGUAGE_STANDARD = gnu11; GCC_DYNAMIC_NO_PIC = NO; GCC_NO_COMMON_BLOCKS = YES; GCC_OPTIMIZATION_LEVEL = 0; GCC_PREPROCESSOR_DEFINITIONS = ("DEBUG=1","$(inherited)"); GCC_WARN_64_TO_32_BIT_CONVERSION = YES; GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR; GCC_WARN_UNDECLARED_SELECTOR = YES; GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE; GCC_WARN_UNUSED_FUNCTION = YES; GCC_WARN_UNUSED_VARIABLE = YES; IPHONEOS_DEPLOYMENT_TARGET = 16.0; MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE; MTL_FAST_MATH = YES; ONLY_ACTIVE_ARCH = YES; SDKROOT = iphoneos; SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; SWIFT_OPTIMIZATION_LEVEL = "-Onone"; }; name = Debug; };
		A1000072 /* Release */ = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ANALYZER_NONNULL = YES; CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE; CLANG_CXX_LANGUAGE_STANDARD = "gnu++20"; CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; CLANG_ENABLE_OBJC_WEAK = YES; CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES; CLANG_WARN_BOOL_CONVERSION = YES; CLANG_WARN_COMMA = YES; CLANG_WARN_CONSTANT_CONVERSION = YES; CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES; CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR; CLANG_WARN_DOCUMENTATION_COMMENTS = YES; CLANG_WARN_EMPTY_BODY = YES; CLANG_WARN_ENUM_CONVERSION = YES; CLANG_WARN_INFINITE_RECURSION = YES; CLANG_WARN_INT_CONVERSION = YES; CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES; CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES; CLANG_WARN_OBJC_LITERAL_CONVERSION = YES; CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR; CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES; CLANG_WARN_RANGE_LOOP_ANALYSIS = YES; CLANG_WARN_STRICT_PROTOTYPES = YES; CLANG_WARN_SUSPICIOUS_MOVE = YES; CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE; CLANG_WARN_UNREACHABLE_CODE = YES; CLANG_WARN__DUPLICATE_METHOD_MATCH = YES; COPY_PHASE_STRIP = NO; DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"; ENABLE_NS_ASSERTIONS = NO; ENABLE_STRICT_OBJC_MSGSEND = YES; GCC_C_LANGUAGE_STANDARD = gnu11; GCC_NO_COMMON_BLOCKS = YES; GCC_WARN_64_TO_32_BIT_CONVERSION = YES; GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR; GCC_WARN_UNDECLARED_SELECTOR = YES; GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE; GCC_WARN_UNUSED_FUNCTION = YES; GCC_WARN_UNUSED_VARIABLE = YES; IPHONEOS_DEPLOYMENT_TARGET = 16.0; MTL_ENABLE_DEBUG_INFO = NO; MTL_FAST_MATH = YES; SDKROOT = iphoneos; SWIFT_COMPILATION_MODE = wholemodule; SWIFT_OPTIMIZATION_LEVEL = "-O"; VALIDATE_PRODUCT = YES; }; name = Release; };
		A1100001 = {isa = PBXBuildFile; fileRef = A1000001; };
		A1100002 = {isa = PBXBuildFile; fileRef = A1000002; };
		A1100003 = {isa = PBXBuildFile; fileRef = A1000003; };
		A1100004 = {isa = PBXBuildFile; fileRef = A1000004; };
		A1100005 = {isa = PBXBuildFile; fileRef = A1000005; };
		A1100006 = {isa = PBXBuildFile; fileRef = A1000006; };
		A1100007 = {isa = PBXBuildFile; fileRef = A1000007; };
	};
	rootObject = A1000080 /* Project object */;
	A1000080 /* Project object */ = {isa = PBXProject; attributes = {BuildIndependentTargetsInParallel = 1; LastSwiftUpdateCheck = 1500; LastUpgradeCheck = 1500; TargetAttributes = {A1000050 = {CreatedOnToolsVersion = 15.0; }; }; }; buildConfigurationList = A1000070; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base); mainGroup = A1000040; productRefGroup = A1000031; projectDirPath = ""; projectRoot = ""; targets = (A1000050); };
}
EOF

echo "Xcode project created successfully"
