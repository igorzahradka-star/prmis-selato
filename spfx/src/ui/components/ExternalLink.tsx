/**
 * Odkaz na soubor nebo složku, který se vždy otevře v nové kartě.
 *
 * Proč nestačí `target="_blank"`: SharePoint na moderních stránkách „zachytává" kliknutí na odkazy na vlastním webu
 * a otevírá je uvnitř stránky. Zavření takového souboru pak zavře i aplikaci. `data-interception="off"` mu to zakáže
 * a `rel="noopener noreferrer"` odpojí novou kartu od aplikace.
 */

import * as React from 'react';
import { Link, ILinkProps } from '@fluentui/react/lib/Link';

export const ExternalLink: React.FC<ILinkProps> = (props) => (
  <Link {...props} target="_blank" rel="noopener noreferrer" data-interception="off" />
);

/** Atributy pro ostatní prvky s `href` (tlačítka), které se mají otevřít v nové kartě. */
export const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
  'data-interception': 'off'
} as const;
