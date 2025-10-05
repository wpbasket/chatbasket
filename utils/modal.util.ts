// utils/modal.utils.ts
import { modalActions, modal$ } from '@/state/modals/modals.state';
import type { DropdownPickerItem, DropdownPickerModalProps, ModalPosition, ControllerSpec, ControllersModalProps, LoadingModalProps } from '@/components/modals/types/modal.types';

export const showConfirmDialog = async (
  message: string,
  options?: {
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'default' | 'destructive';
    cancelVariant?: 'default' | 'destructive';
    position?: ModalPosition;
  }
): Promise<boolean> => {
  return new Promise((resolve) => {
    let settled = false;
    const id = `confirm:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    modalActions.open('confirm', {
      message,
      confirmText: options?.confirmText || 'Confirm',
      cancelText: options?.cancelText || 'Cancel',
      confirmVariant: options?.confirmVariant || 'default',
      cancelVariant: options?.cancelVariant || 'default',
      onConfirm: () => {
        if (!settled) {
          settled = true;
          resolve(true);
        }
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    }, id, options?.position);
  });
};

export const showAlert = (message: string, title?: string, position?: ModalPosition): void => {
  modalActions.alert(message, title, position);
};

export const showDropdownPicker = async <T = any>(
  items: DropdownPickerItem<T>[],
  options?: Omit<DropdownPickerModalProps<T>, 'items' | 'onSelect' | 'onClose'> & { position?: ModalPosition }
): Promise<{ value: T; item: DropdownPickerItem<T> } | null> => {
  // Validate inputs
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.warn('showDropdownPicker: items must be a non-empty array');
    return null;
  }

  const { position, ...modalOptions } = options || {};

  return new Promise((resolve) => {
    let settled = false;
    const id = `dropdown:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    modalActions.open('dropdown-picker', {
      items,
      ...modalOptions,
      onSelect: (value: T, item: DropdownPickerItem<T>) => {
        if (!settled) {
          settled = true;
          resolve({ value, item });
        }
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    }, id, position);
  });
};

export const showControllersModal = async (
  controllers: ControllerSpec[],
  options?: Omit<ControllersModalProps, 'controllers'> & { position?: ModalPosition }
): Promise<boolean> => {
  if (!controllers || !Array.isArray(controllers) || controllers.length === 0) {
    console.warn('showControllersModal: controllers must be a non-empty array');
    return false;
  }

  const { position, ...modalOptions } = options || {};

  return new Promise((resolve) => {
    let settled = false;
    const id = `controllers:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    modalActions.open(
      'controllers',
      {
        controllers,
        confirmDisabled: false, // Default value
        ...modalOptions, // spread caller options first
        // then provide composed handlers that call caller hooks before resolving
        onConfirm: async () => {
          try {
            await modalOptions.onConfirm?.();
          } finally {
            if (!settled) {
              settled = true;
              resolve(true);
            }
          }
        },
        onCancel: async () => {
          try {
            await modalOptions.onCancel?.();
          } finally {
            if (!settled) {
              settled = true;
              resolve(false);
            }
          }
        },
        onClose: () => {
          try {
            modalOptions.onClose?.();
          } finally {
            if (!settled) {
              settled = true;
              resolve(false);
            }
          }
        },
      },
      id,
      position
    );
  });
};

export const hideModal = (): void => {
  modalActions.close();
};

export const showLoading = (
  options?: (Omit<LoadingModalProps, 'onClose'>) & { position?: ModalPosition }
): { hide: () => void; id: string } => {
  const { position, ...props } = options || {};
  const id = `loading:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  modalActions.open(
    'loading',
    {
      title: props.title,
      message: props.message,
      cancellable: props.cancellable,
      onCancel: props.onCancel,
      // default: backdrop should not close loading unless explicitly allowed
      closeOnBackgroundTap: props.closeOnBackgroundTap ?? false,
    },
    id,
    position
  );
  return {
    id,
    hide: () => {
      // Close only this loading instance if still present
      modalActions.closeById(id);
    },
  };
};

export const hideLoading = (): void => {
  // Close top-most only if it's a loading modal (legacy behavior)
  if (modal$.type.get() === 'loading') {
    modalActions.close();
  }
};

// Run an async task with the loading modal shown automatically
export async function runWithLoading<T>(
  task: Promise<T> | (() => Promise<T>),
  options?: (Omit<LoadingModalProps, 'onClose'>) & { position?: ModalPosition }
): Promise<T> {
  const { position, ...props } = options || {};
  const id = `loading:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  modalActions.open(
    'loading',
    {
      title: props.title,
      message: props.message,
      cancellable: props.cancellable,
      onCancel: props.onCancel,
      closeOnBackgroundTap: props.closeOnBackgroundTap ?? false,
    },
    id,
    position
  );

  try {
    const promise = typeof task === 'function' ? task() : task;
    const result = await promise;
    return result;
  } finally {
    modalActions.closeById(id);
  }
}

// Usage examples:
/*
// Confirm dialog with promise and position
const handleButtonPress = async (event) => {
  const position = {
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY
  };
  
  const result = await showConfirmDialog('Are you sure you want to delete this item?', {
    confirmVariant: 'destructive',
    confirmText: 'Delete',
    position,
  });
  if (result) {
    // User confirmed - proceed with deletion
  }
};

// Simple alert with position
const handleAlertPress = (event) => {
  const position = {
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY
  };
  showAlert('Operation completed successfully!', 'Success', position);
};

// Controllers modal with disabled confirm button
const result = await showControllersModal(
  [
    { id: '1', label: 'Option 1', onPress: () => console.log('Option 1') },
    { id: '2', label: 'Option 2', onPress: () => console.log('Option 2') },
  ],
  {
    title: 'Select an option',
    confirmText: 'Apply',
    confirmDisabled: true, // This will disable and style the confirm button
    onConfirm: async () => {
      console.log('Confirmed');
    },
  }
);
*/