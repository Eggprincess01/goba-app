import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

export const IS_NATIVE_LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

export interface LiquidGlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  variant?: 'light' | 'dark' | 'sakura';
  interactive?: boolean;
  borderRadius?: number;
}

/**
 * Apple 原生 Liquid Glass 跨版本相容封裝元件：
 * - iOS 26+（如 iPhone 16 Pro）：啟用原生 UIGlassEffect（expo-glass-effect GlassView）
 * - iOS 15–18 / 其他平台：自動優雅降級為高質感毛玻璃（expo-blur BlurView + 鏡面高光邊框）
 */
export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  style,
  contentStyle,
  variant = 'light',
  interactive = false,
  borderRadius = 22,
}) => {
  const isDark = variant === 'dark';
  const isSakura = variant === 'sakura';

  if (IS_NATIVE_LIQUID_GLASS) {
    const tintColor = isDark
      ? 'rgba(28, 12, 22, 0.72)'
      : isSakura
      ? 'rgba(255, 240, 247, 0.55)'
      : 'rgba(255, 255, 255, 0.48)';

    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        colorScheme={isDark ? 'dark' : 'light'}
        tintColor={tintColor}
        style={[
          styles.base,
          { borderRadius },
          isDark ? styles.darkRim : styles.lightRim,
          style,
        ]}
      >
        <View style={[styles.inner, contentStyle]}>{children}</View>
      </GlassView>
    );
  }

  // iOS 18 以下與非支援裝置降級為原生系統級毛玻璃
  return (
    <View
      style={[
        styles.base,
        { borderRadius },
        isDark ? styles.fallbackDarkWrap : isSakura ? styles.fallbackSakuraWrap : styles.fallbackLightWrap,
        style,
      ]}
    >
      <BlurView
        intensity={isDark ? 82 : 76}
        tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? 'rgba(24, 10, 18, 0.62)'
              : isSakura
              ? 'rgba(255, 241, 247, 0.62)'
              : 'rgba(255, 255, 255, 0.65)',
          },
        ]}
      />
      <View style={[styles.inner, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    shadowColor: '#1F111A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  inner: {
    position: 'relative',
  },
  lightRim: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.75)',
  },
  darkRim: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  fallbackLightWrap: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  fallbackSakuraWrap: {
    borderWidth: 1,
    borderColor: 'rgba(251, 207, 232, 0.85)',
  },
  fallbackDarkWrap: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
});
