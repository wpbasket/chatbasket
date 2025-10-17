import Header from "@/components/header/Header"
import Sidebar from "@/components/sidebar/Sidebar"
import { ThemedText } from "@/components/ui/common/ThemedText"
import { ThemedView } from "@/components/ui/common/ThemedView"
import { ThemedViewWithSidebar } from "@/components/ui/common/ThemedViewWithSidebar"
import { IconSymbol } from "@/components/ui/fonts/IconSymbol"
import { utilGoBack } from "@/utils/commonUtils/util.router"
import { StyleSheet } from "react-native-unistyles"


export default function Contacts() {

    return (
        <ThemedViewWithSidebar>
            <ThemedViewWithSidebar.Sidebar>
                <Sidebar />
            </ThemedViewWithSidebar.Sidebar>
            <ThemedViewWithSidebar.Main>
                <Header
                    leftButton={{
                        child: <IconSymbol name='arrow.left' />,
                        onPress: utilGoBack,
                    }}
                    centerIcon={true}
                    Icon={<ThemedText type='subtitle'>Contacts</ThemedText>}
                />

                <ThemedView style={styles.container}> // Outer container
                    
                    

                </ThemedView> // End outer container



            </ThemedViewWithSidebar.Main>
        </ThemedViewWithSidebar>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    container: {
        flex: 1,
        gap: 20,
        paddingHorizontal: 20,
    },
}))