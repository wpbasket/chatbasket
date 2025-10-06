/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";


export const Colors = {
  light: {
    primary: '#00bb77',
    primaryWhite:'#FFFFFF',
    primaryOpacity: 'rgba(0, 187, 119, 0.1)',
    whiteOrBlack: '#000000',
    blackOrWhite: '#FFFFFF',
    white: '#FFFFFF',
    black: '#000000',
    primaryLight: '#de8286',
    primaryDark: '#00bb77',
    text: '#2C3E50',
    reverseText: '#FFFFFF',
    // text: '#11181C',
    // background: 'rgb(255, 255, 255)',
    background: 'rgb(255, 255, 255)',
    // BackgroundSelect: 'rgba(238, 247, 247,1)',
    BackgroundSelect: '#FFFFFF',
    BackgroundSelect2: '#FFFFFF',
    backgroundSelect3: 'rgb(240, 240, 240)',
    lightbackgroundText: 'rgb(238, 247, 247)',
    reverseBackground: 'rgb(13,13,13)',
    icon: '#687076',
    tabIconSelected: '#00bb77',
    title: '#2C3E50', // Dark blue-gray for main title
    subtitle: '#34495E', // Slightly lighter blue-gray for subtitles
    reverseSubtitle: '#BDC3C7',
    loader: '#00bb77',
    skyblue: 'rgba(92, 222, 251, 1)',
    orange: 'rgb(235, 87, 87)',
    yellow: 'rgb(242, 178, 76)',
    darkblue: 'rgb(8, 59, 125)',
    green: '#00bb77',
    primaryDarkShadow: '#00bb77',
    neutral: 'rgba(115, 115, 115, 0.3)',
    neutral5: 'rgba(115, 115, 115, 0.8)',
    neutral2: 'rgba(115, 115, 115, 0.7)',
    neutral3: 'rgba(115, 115, 115, 0.1)',
    neutral0: 'rgba(115, 115, 115, 0.1)',
    neutral1: 'rgba(115, 115, 115, 0.2)',
    neutral4: 'rgba(115, 115, 115, 0.7)',
    red: '#FF0000',
    // skyblue: 'rgba(0, 187, 230, 1)' // sky blue alternative
  },
  dark: {
    primary: '#00bb77',
    primaryWhite:'#00bb77',
    primaryOpacity: 'rgba(115, 115, 115, 0.1)',
    white: '#FFFFFF',
    black: '#000000',
    whiteOrBlack: '#FFFFFF',
    blackOrWhite: '#000000',
    primaryLight: '#de8286',
    primaryDark: '#FFFFFF',
    text: '#FFFFFF',
    reverseText: '#2C3E50',
    background: Platform.OS == 'web' ? 'rgb(15,15,15)' : 'rgb(13,13,13)',
    BackgroundSelect: 'rgba(24,25,27,1)',
    // BackgroundSelect:'rgba(24,25,27,1)',
    BackgroundSelect2: Platform.OS == 'web' ? 'rgb(15,15,15)' : 'rgb(13,13,13)',
    backgroundSelect3: 'rgb(22,22,22)',
    lightbackgroundText: 'rgb(238, 247, 247)',
    reverseBackground: 'rgb(238, 247, 247)',
    icon: '#9BA1A6',
    tabIconSelected: '#00bb77',
    title: 'rgb(238, 247, 247)', // Light gray-white for main title
    subtitle: '#BDC3C7', // Slightly darker gray for subtitles
    reverseSubtitle: '#34495E',
    loader: 'rgb(238,247,247)',
    skyblue: 'rgba(92, 222, 251, 1)',
    orange: 'rgb(235, 87, 87)',
    yellow: 'rgb(242, 178, 76)',
    darkblue: 'rgb(8, 59, 125)',
    green: '#00bb77',
    neutral: 'rgba(115, 115, 115, 0.3)',
    neutral5: 'rgba(115, 115, 115, 0.5)',
    primaryDarkShadow: 'rgba(1,1,1, 1)',
    neutral2: 'rgba(115, 115, 115, 0.7)',
    neutral3: 'rgba(115, 115, 115, 0.3)',
    neutral0: 'rgba(115, 115, 115, 0.1)',
    neutral1: 'rgba(115, 115, 115, 0.2)',
    neutral4:'#2D2D31',

    red: '#FF0000',
    // skyblue: 'rgba(0, 187, 230, 1)' // sky blue alternative
  },

};


// 45,45,45 #18191b
// #111113
// #0c0d0e