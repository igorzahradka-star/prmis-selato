/**
 * Tlačítka schvalování — jednotná v celé aplikaci (objednávky, rozpočty, podklady): **Schválit = zelené**,
 * **Vrátit k úpravě = žluté**, Zamítnout = červené. Barva nikdy nestojí sama (vždy je i text).
 */

import * as React from 'react';
import { DefaultButton, IButtonProps, IButtonStyles, PrimaryButton } from '@fluentui/react/lib/Button';

import { RES } from '../theme';

const GREEN = RES.greenDark;
const GREEN_HOVER = '#008F4A';
const AMBER = '#F2B91D';
const AMBER_HOVER = '#E0A800';

function colored(bg: string, hover: string, color: string, border: string): IButtonStyles {
  return {
    root: { backgroundColor: bg, borderColor: border, color },
    rootHovered: { backgroundColor: hover, borderColor: hover, color },
    rootPressed: { backgroundColor: hover, borderColor: hover, color },
    rootFocused: { backgroundColor: bg, color },
    label: { fontWeight: 600 }
  };
}

/** Schválit (zelené). */
export const ApproveButton: React.FC<IButtonProps> = (props) => <PrimaryButton {...props} styles={props.disabled ? undefined : colored(GREEN, GREEN_HOVER, '#FFFFFF', GREEN)} />;

/** Vrátit k úpravě (žluté). */
export const ReturnButton: React.FC<IButtonProps> = (props) => <DefaultButton {...props} styles={props.disabled ? undefined : colored(AMBER, AMBER_HOVER, RES.text, AMBER)} />;

/** Zamítnout (červené). */
export const RejectButton: React.FC<IButtonProps> = (props) => <DefaultButton {...props} styles={props.disabled ? undefined : colored(RES.red, '#A8283E', '#FFFFFF', RES.red)} />;
