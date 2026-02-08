import type { ReactNode } from 'react';

export interface BaseModalProps {
  onClose?: () => void;
  // Controls whether tapping on overlay/backdrop should close the modal (default: true)
  closeOnBackgroundTap?: boolean;
}

export interface ConfirmModalProps extends BaseModalProps {
  message: string | ReactNode;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  cancelVariant?: 'default' | 'destructive';
  confirmVariant?: 'default' | 'destructive';
}

export interface AlertModalProps extends BaseModalProps {
  message: string;
  title?: string;
  buttonText?: string;
}

export interface DropdownPickerItem<T = any> {
  label: string;
  value: T;
  disabled?: boolean;
  icon?: string;
  subtitle?: string;
}

export interface DropdownPickerModalProps<T = any> extends BaseModalProps {
  title?: string;
  items: DropdownPickerItem<T>[];
  selectedValue?: T;
  onSelect: (value: T, item: DropdownPickerItem<T>) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  cancelText?: string;
  // Styling props - using Record for better type safety and performance
  modalStyles?: {
    container?: any;
    header?: any;
    title?: any;
    searchContainer?: any;
    searchInput?: any;
    item?: any;
    selectedItem?: any;
    disabledItem?: any;
    itemLabel?: any;
    selectedItemLabel?: any;
    disabledItemLabel?: any;
    itemSubtitle?: any;
    checkmark?: any;
    footer?: any;
    cancelButton?: any;
    cancelButtonText?: any;
    emptyContainer?: any;
    emptyText?: any;
  };
}

export interface ModalPosition {
  x: number;
  y: number;
}

// Controllers modal

export interface ControllerSpec {
  id: string;
  // Optional label for button-type controllers
  label?: string;
  disabled?: boolean;
  onPress?: () => void | Promise<void>;
  // Optional arbitrary content to render (e.g., a TextInput). If provided, this row renders the content instead of a button.
  content?: ReactNode;
}

export interface ControllersModalProps extends BaseModalProps {
  title?: string;
  message?: string;
  controllers: ControllerSpec[];
  confirmText?: string;
  cancelText?: string;
  // Control visibility of footer buttons
  showConfirmButton?: boolean;
  showCancelButton?: boolean;
  closeOnControllerPress?: boolean;
  confirmDisabled?: boolean;
  // Outer buttons callbacks
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}

// Loading modal
export interface LoadingModalProps extends BaseModalProps {
  title?: string;
  message?: string;
  // If true, show a cancel button and allow backdrop press to cancel when not explicitly disabled
  cancellable?: boolean;
  onCancel?: () => void;
}

export type ModalType = 'confirm' | 'alert' | 'dropdown-picker' | 'controllers' | 'loading';

export interface ModalState {
  isVisible: boolean;
  type: ModalType;
  props: Record<string, any>;
  id?: string;
  position?: ModalPosition;
}