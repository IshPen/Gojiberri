import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { colors, radius, spacing } from "../constants/theme";

export type GridPhoto = { _id: string; url: string; caption?: string; userName?: string };

type Props = {
  photos: GridPhoto[];
  onPressPhoto: (photo: GridPhoto) => void;
  testIDPrefix?: string;
};

const COLUMNS = 3;
const GAP = spacing.sm;
const SIDE_PADDING = spacing.xl;

export default function PhotoGrid({ photos, onPressPhoto, testIDPrefix = "photo-tile" }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - SIDE_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <View style={styles.grid}>
      {photos.map((photo, i) => (
        <Pressable
          key={photo._id}
          testID={`${testIDPrefix}-${i}`}
          accessibilityRole="button"
          accessibilityLabel={photo.caption ?? `Photo ${i + 1}`}
          onPress={() => onPressPhoto(photo)}
          style={({ pressed }) => [{ width: size, height: size }, styles.tile, pressed && styles.pressed]}
        >
          <Image source={{ uri: photo.url }} style={styles.image} resizeMode="cover" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.cardMuted },
  image: { width: "100%", height: "100%" },
  pressed: { opacity: 0.85 },
});
