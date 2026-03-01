import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { StyleSheet } from 'react-native-unistyles';

type BulkActionBarProps = {
    selectedCount: number;
    onUnsend: () => void;
    onDelete: () => void;
    onCancel: () => void;
    showUnsend: boolean;
};

export const BulkActionBar = ({ selectedCount, onUnsend, onDelete, onCancel, showUnsend }: BulkActionBarProps) => {
    const { theme } = useUnistyles();

    if (selectedCount === 0) return null;

    return (
        <ThemedView style={styles.container}>
            <ThemedView style={styles.info}>
                <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
                    <IconSymbol name="chevron.left" size={20} color={theme.colors.text} />
                </TouchableOpacity>
                <ThemedText type="defaultSemiBold" style={styles.countText}>
                    {selectedCount} selected
                </ThemedText>
            </ThemedView>

            <View style={styles.actions}>
                <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
                    <IconSymbol name="alert" size={22} color={theme.colors.text} />
                    <ThemedText style={styles.actionLabel}>Delete</ThemedText>
                </TouchableOpacity>

                {showUnsend && (
                    <TouchableOpacity
                        onPress={() => {
                            console.log('[BulkActionBar] Unsend button pressed');
                            onUnsend();
                        }}
                        style={[styles.actionButton, styles.unsendButton]}
                    >
                        <IconSymbol name="paperplane.fill" size={22} color={theme.colors.errorText} />
                        <ThemedText style={[styles.actionLabel, { color: theme.colors.errorText }]}>Unsend</ThemedText>
                    </TouchableOpacity>
                )}
            </View>
        </ThemedView>
    );
};

const styles = StyleSheet.create((theme, rt) => ({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: theme.colors.card,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        paddingBottom: rt.insets.bottom + 12,
        zIndex: 1000,
    },
    info: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    cancelButton: {
        marginRight: 12,
    },
    countText: {
        fontSize: 16,
        color: theme.colors.text,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        backgroundColor: 'transparent',
    },
    actionButton: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    unsendButton: {
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text,
    },
}));

export default BulkActionBar;
