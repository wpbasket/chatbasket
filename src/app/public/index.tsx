import { Redirect } from 'expo-router';
import React from 'react';

export default function PublicIndex() {
    return <Redirect href="/public/home" />;
}
