import modrinthIcon   from '../assets/icons/modrinth.svg';
import curseforgeIcon from '../assets/icons/curseforge.svg';
import vanillaIcon    from '../assets/icons/vanilla.png';
import fabricIcon     from '../assets/icons/fabric.png';
import forgeIcon      from '../assets/icons/forge.jpg';

/** CurseForge API key — hardcoded, not user-configurable */
export const CF_API_KEY = '$2a$10$uUiUIGgW7zoLg2niyP3p/.5ChxQPf2rpz03vxXzfEeDBaJNQVLymS';

/** Common request headers for every CurseForge call */
export const cfHeaders = { 'x-api-key': CF_API_KEY, Accept: 'application/json' };

/** Provider icon URLs — bundled locally for reliable rendering */
export const PROVIDER_ICONS = {
  modrinth:   modrinthIcon,
  curseforge: curseforgeIcon,
};

/** Loader icon URLs — bundled locally for reliable rendering */
export const LOADER_ICONS = {
  Vanilla: vanillaIcon,
  Fabric:  fabricIcon,
  Forge:   forgeIcon,
};
