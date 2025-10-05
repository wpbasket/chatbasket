import { Platform, Text, type TextProps } from 'react-native';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

export type ThemedTextProps = TextProps & {
  type?:  'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'semibold'
    | 'small' | 'smallBold' | 'titleSmall' | 'logo'| 'defaultGantari'
    | 'gantariWithoutColorAndSize' | 'astaSansWithoutColorAndSize';
  lightColor?: string;
  darkColor?: string;
  color?: string; // <-- Add single color prop
};

export function ThemedText({
  style,
  type = 'default',
  lightColor,
  darkColor,
  color,
  ...rest
}: ThemedTextProps) {
  const currentTheme = UnistylesRuntime.themeName;
  const { useVariants, ...styleMap } = styles;

  // Efficient color resolution: color > theme-based > undefined
  const resolvedColor =
    color ??
    (currentTheme === 'dark' ? darkColor : lightColor);

  return (
    <Text
      style={[
        styleMap[type as keyof typeof styleMap],
        resolvedColor ? { color: resolvedColor } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create(theme => ({
  default: {
    fontSize: 16,
    // lineHeight: 24,
    color: theme.colors.title,
    fontFamily:Platform.select({ios:'AstaSans-Regular',android:'AstaSans400', default:'AstaSans400,arial'}),
  },
  defaultGantari:{
    fontSize:16,
    color:theme.colors.title,
    fontFamily:Platform.select({ios:'Gantari-Regular',android:'Gantari400', default:'Gantari400,arial'}),
  },
  gantariWithoutColorAndSize:{
    fontFamily:Platform.select({ios:'Gantari-Regular',android:'Gantari400', default:'Gantari400,arial'}),
  },
  astaSansWithoutColorAndSize:{
    fontFamily:Platform.select({ios:'AstaSans-Regular',android:'AstaSans400', default:'AstaSans400,arial'}),
  },
  small:{
    fontSize: 12,
    // lineHeight: 18,
    color: theme.colors.title,
    fontFamily:Platform.select({ios:theme.fonts.Gantari200.ios, android:theme.fonts.Gantari200.android, default:theme.fonts.Gantari200.default}),
  },
  smallBold:{
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: theme.colors.title,
    fontFamily:Platform.select({ios:'AstaSans-SemiBold', android:'AstaSans600', default:'AstaSans400,arial'}),
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: theme.colors.primary,
    fontFamily:Platform.select({ios:'AstaSans-SemiBold',android:'AstaSans600', default:'AstaSans400,arial'}),
  },
  semibold:{
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    color: theme.colors.title,
    fontFamily:Platform.select({ios:'AstaSans-Regular', android:'AstaSans400', default:'AstaSans400,arial'}),
  },
  logo: {
    fontSize: 25,
    fontWeight: '400',
    lineHeight: 25,
    letterSpacing:-0.5,
    fontFamily:Platform.select({ios:'Gantari-Regular', android:'Gantari400',default:'Gantari400,arial'}),

    color: theme.colors.title,
  },
  titleSmall: {
    fontSize: 25,
    fontWeight: '400',
    lineHeight: 25,
    color: theme.colors.white,
    fontFamily:Platform.select({ios:'Gantari-Regular', android:'Gantari400', default:'Gantari400,arial'}),
  },
  title:{
    fontSize:32,
    lineHeight:35,
    letterSpacing:1,
    fontWeight:'600',
    color:theme.colors.title,
    fontFamily:Platform.select({ios:'Gantari-SemiBold', android:'Gantari600', default:'Gantari400,arial'}),
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.subtitle,
    fontFamily:Platform.select({ios:'Gantari-SemiBold', android:'Gantari600', default:'Gantari400,arial'}),
  },
  link: {
    lineHeight: 24,
    fontSize: 16,
    color: '#2563eb',
    textDecorationLine: 'underline',
    fontWeight: '600',
    fontFamily:Platform.select({ios:'Gantari-SemiBold', android:'Gantari600', default:'Gantari400,arial'}),
  }
}));
