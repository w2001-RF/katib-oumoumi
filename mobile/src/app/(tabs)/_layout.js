import { Tabs } from 'expo-router';
import { Icon } from '../../components/ui';
import { fonts, headerOptions, useTheme } from '../../theme';

// The four sections of the web app's bottom bar, in the same order: in
// right-to-left, «الرئيسية» sits on the right.
const TABS = [
  { name: 'index', title: 'الرئيسية', header: 'كاتب عمومي', icon: 'home' },
  { name: 'categories', title: 'التصنيفات', icon: 'grid' },
  { name: 'history', title: 'السجل', header: 'سجل الوثائق', icon: 'history' },
  { name: 'settings', title: 'الإعدادات', icon: 'settings' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const { contentStyle, ...header } = headerOptions(colors);
  return (
    <Tabs
      screenOptions={{
        ...header,
        sceneStyle: contentStyle,
        tabBarActiveTintColor: colors.heading,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.frame },
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 12 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerTitle: tab.header ?? tab.title,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={color} size={22} />,
          }}
        />
      ))}
    </Tabs>
  );
}
