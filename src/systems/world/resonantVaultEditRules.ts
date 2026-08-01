import { BlockType } from '../../types';

export type VaultPlayerEdit =
    | { kind: 'break'; currentBlock: BlockType }
    | { kind: 'place'; currentBlock: BlockType; placedBlock: BlockType };

export function canEditSealedVaultCell(edit: VaultPlayerEdit, torchDeniedCell: boolean): boolean {
    if (edit.kind === 'break') return edit.currentBlock === BlockType.ECHO_CRYSTAL;
    return edit.placedBlock === BlockType.TORCH
        && edit.currentBlock === BlockType.AIR
        && !torchDeniedCell;
}
