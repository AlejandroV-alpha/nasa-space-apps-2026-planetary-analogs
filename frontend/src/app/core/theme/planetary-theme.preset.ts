import { definePreset, type Preset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const PLANETARY_THEME_PRESET = definePreset<Preset>(Aura, {
  primitive: {
    spaceBlue: {
      50: '#EFF7FF',
      100: '#DBEDFF',
      200: '#B9DDFF',
      300: '#8BC5FF',
      400: '#53A4F5',
      500: '#2588E8',
      600: '#1473D2',
      700: '#125CAB',
      800: '#144B87',
      900: '#173E6D',
      950: '#102744',
    },
    marsOrange: {
      50: '#FFF7ED',
      100: '#FFEDD5',
      200: '#FED7AA',
      300: '#FDBA74',
      400: '#FB923C',
      500: '#E87932',
      600: '#D45A20',
      700: '#B3441C',
      800: '#91391F',
      900: '#78321E',
      950: '#451A0E',
    },
  },
  semantic: {
    iconSize: '1.125rem',

    formField: {
      hoverBorderColor: '{primary.color}',
      focusBorderColor: '{primary.color}',
    },

    primary: {
      50: '{spaceBlue.50}',
      100: '{spaceBlue.100}',
      200: '{spaceBlue.200}',
      300: '{spaceBlue.300}',
      400: '{spaceBlue.400}',
      500: '{spaceBlue.500}',
      600: '{spaceBlue.600}',
      700: '{spaceBlue.700}',
      800: '{spaceBlue.800}',
      900: '{spaceBlue.900}',
      950: '{spaceBlue.950}',
    },

    colorScheme: {
      light: {
        primary: {
          color: '{primary.600}',
          contrastColor: '{surface.0}',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        surface: {
          0: '#FFFFFF',
          50: '#F8FAFD',
          100: '#F1F5FA',
          200: '#E3EAF3',
          300: '#CDD8E6',
          400: '#97A9BE',
          500: '#6B7F96',
          600: '#52657C',
          700: '#3B4D63',
          800: '#28394D',
          900: '#172639',
          950: '#0D1828',
        },
        text: {
          color: '{surface.800}',
          hoverColor: '{surface.900}',
          mutedColor: '{surface.600}',
          hoverMutedColor: '{surface.700}',
        },
      },

      dark: {
        primary: {
          color: '{primary.300}',
          contrastColor: '{surface.950}',
          hoverColor: '{primary.200}',
          activeColor: '{primary.100}',
        },
        surface: {
          0: '#FFFFFF',
          50: '#F3F7FC',
          100: '#E5EDF6',
          200: '#CAD8E8',
          300: '#A7BCD3',
          400: '#809AB5',
          500: '#627D99',
          600: '#435C78',
          700: '#2B415B',
          800: '#1B2D44',
          900: '#111E30',
          950: '#0B1220',
        },
        text: {
          color: '{surface.50}',
          hoverColor: '{surface.0}',
          mutedColor: '{surface.300}',
          hoverMutedColor: '{surface.200}',
        },
      },
    },

    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.color}',
      offset: '2px',
      shadow: 'none',
    },
  },

  extend: {
    planetaryAccent: {
      color: 'light-dark({marsOrange.600}, {marsOrange.500})',
      hoverColor: 'light-dark({marsOrange.700}, {marsOrange.400})',
    },
  },
});
