package dev.atlas;

import com.google.gson.*;
import java.util.*;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.block.*;
import net.minecraft.component.type.FoodComponent;
import net.minecraft.item.*;
import net.minecraft.recipe.Ingredient;
import net.minecraft.registry.*;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.sound.*;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

public final class Content {
  public static final Map<String, Block> BLOCKS = new LinkedHashMap<>();
  public static final Map<String, Item> ITEMS = new LinkedHashMap<>();
  public static final Map<Integer, BlockState> LEGACY = new HashMap<>();
  public static final Map<String, JsonObject> DEFINITIONS = new LinkedHashMap<>();
  public static final Map<String, SoundEvent> SOUNDS = new LinkedHashMap<>();
  private static final Set<String> MECHANISMS =
      Set.of(
          "magnetic_boss_summoner",
          "magnetic_shield_crystal",
          "resonance_pylon",
          "pulse_conduit",
          "phase_block",
          "resonance_plate",
          "sentinel_core",
          "listening_stone",
          "vault_seal");
  private static final Set<String> CRYSTALS =
      Set.of(
          "positive_magnetite_crystal",
          "negative_magnetite_crystal",
          "magnetic_shield_crystal",
          "echo_crystal",
          "magnetic_spike",
          "echo_spikes",
          "magnetite_shard");
  public static final RegistryEntry<ArmorMaterial> COPPER =
      Registry.registerReference(
          Registries.ARMOR_MATERIAL,
          Atlas.id("copper"),
          new ArmorMaterial(
              Map.of(
                  ArmorItem.Type.HELMET,
                  2,
                  ArmorItem.Type.CHESTPLATE,
                  5,
                  ArmorItem.Type.LEGGINGS,
                  4,
                  ArmorItem.Type.BOOTS,
                  1,
                  ArmorItem.Type.BODY,
                  5),
              10,
              SoundEvents.ITEM_ARMOR_EQUIP_IRON,
              () -> Ingredient.ofItems(Items.COPPER_INGOT),
              List.of(new ArmorMaterial.Layer(Atlas.id("copper"))),
              0,
              0));

  public static void init() {
    for (var e : SourceData.json("sounds.json").getAsJsonObject().entrySet())
      SOUNDS.put(
          e.getKey(),
          Registry.register(
              Registries.SOUND_EVENT,
              Atlas.id(e.getKey()),
              e.getKey().startsWith("magnetic_warden.") || e.getKey().startsWith("resonant_vault.")
                  ? SoundEvent.of(Atlas.id(e.getKey()), 64)
                  : SoundEvent.of(Atlas.id(e.getKey()))));
    for (var el : SourceData.json("content.json").getAsJsonArray()) {
      var d = el.getAsJsonObject();
      String path = d.get("path").getAsString();
      DEFINITIONS.put(path, d);
      if (!d.get("custom").getAsBoolean()) continue;
      Item item;
      if (d.get("block").getAsBoolean()) {
        var settings =
            AbstractBlock.Settings.create()
                .strength((float) SourceData.number(d, "hardness", 2), 8)
                .sounds(BlockSoundGroup.DEEPSLATE)
                .requiresTool();
        int light = SourceData.integer(d, "lightLevel", 0);
        settings.luminance(
            s ->
                path.equals("magnetic_shield_crystal")
                    ? (s.get(AtlasBlock.ACTIVE) ? 12 : 0)
                    : path.equals("resonance_pylon") ? (s.get(AtlasBlock.ACTIVE) ? 10 : 3) : light);
        Block block;
        if (path.endsWith("_slab")) block = new SlabBlock(settings);
        else if (path.endsWith("_stairs"))
          block =
              new StairsBlock(block(d.get("textureParent").getAsInt()).getDefaultState(), settings);
        else if (MECHANISMS.contains(path)) block = new AtlasBlock(path, settings);
        else if (CRYSTALS.contains(path)) block = new AtlasCrystalBlock(path, settings.nonOpaque());
        else block = new Block(settings);
        BLOCKS.put(path, Registry.register(Registries.BLOCK, Atlas.id(path), block));
        item = new BlockItem(block, new Item.Settings());
      } else item = createItem(path, d);
      ITEMS.put(path, Registry.register(Registries.ITEM, Atlas.id(path), item));
    }
    for (var el : SourceData.json("content.json").getAsJsonArray()) {
      var d = el.getAsJsonObject();
      var name = Identifier.of(d.get("mc").getAsString());
      Block b = Registries.BLOCK.get(name);
      LEGACY.put(d.get("id").getAsInt(), b.getDefaultState());
    }
    var relay =
        new AtlasBlock(
            "induction_relay",
            AbstractBlock.Settings.create()
                .strength(3, 8)
                .sounds(BlockSoundGroup.COPPER)
                .luminance(s -> s.get(AtlasBlock.ACTIVE) ? 7 : 0));
    BLOCKS.put(
        "induction_relay", Registry.register(Registries.BLOCK, Atlas.id("induction_relay"), relay));
    ITEMS.put(
        "induction_relay",
        Registry.register(
            Registries.ITEM,
            Atlas.id("induction_relay"),
            new BlockItem(relay, new Item.Settings())));
    Registry.register(
        Registries.ITEM_GROUP,
        Atlas.id("adventure"),
        FabricItemGroup.builder()
            .displayName(Text.translatable("itemGroup.atlas"))
            .icon(() -> new ItemStack(item("polarity_boots")))
            .entries((ctx, out) -> ITEMS.values().forEach(out::add))
            .build());
  }

  private static Item createItem(String path, JsonObject d) {
    var s = new Item.Settings();
    if (d.has("nutrition"))
      return new Item(
          s.food(
              new FoodComponent.Builder()
                  .nutrition(d.get("nutrition").getAsInt())
                  .saturationModifier((float) SourceData.number(d, "saturationModifier", .3))
                  .build()));
    for (var type :
        List.of(
            ArmorItem.Type.HELMET,
            ArmorItem.Type.CHESTPLATE,
            ArmorItem.Type.LEGGINGS,
            ArmorItem.Type.BOOTS))
      if (path.endsWith(type.getName())) {
        var material = path.startsWith("copper") ? COPPER : ArmorMaterials.IRON;
        return new ArmorItem(
            material, type, s.maxDamage(type.getMaxDamage(path.contains("upgraded") ? 32 : 18)));
      }
    if (path.equals("vault_crossbow")) return new CrossbowItem(s.maxDamage(700));
    if (path.equals("vault_bolt")) return new ArrowItem(s);
    if (path.equals("echo_tuning_fork")) return new TuningForkItem(s.maxCount(1));
    if (path.endsWith("pickaxe"))
      return new PickaxeItem(
          ToolMaterials.STONE,
          s.attributeModifiers(
              PickaxeItem.createAttributeModifiers(ToolMaterials.STONE, 1, -2.8f)));
    if (path.endsWith("shovel"))
      return new ShovelItem(
          ToolMaterials.STONE,
          s.attributeModifiers(ShovelItem.createAttributeModifiers(ToolMaterials.STONE, 1.5f, -3)));
    if (path.endsWith("hoe"))
      return new HoeItem(
          ToolMaterials.STONE,
          s.attributeModifiers(HoeItem.createAttributeModifiers(ToolMaterials.STONE, -1, -2)));
    if (path.endsWith("axe") && !path.endsWith("pickaxe"))
      return new AxeItem(
          ToolMaterials.STONE,
          s.attributeModifiers(AxeItem.createAttributeModifiers(ToolMaterials.STONE, 7, -3.2f)));
    if (path.endsWith("sword")
        || path.endsWith("spear")
        || path.endsWith("maul")
        || path.endsWith("hammer")) return new AtlasWeaponItem(path, s);
    return new Item(s);
  }

  public static Block block(String path) {
    return Objects.requireNonNull(BLOCKS.get(path), path);
  }

  private static Block block(int id) {
    var d =
        DEFINITIONS.values().stream()
            .filter(v -> v.get("id").getAsInt() == id)
            .findFirst()
            .orElseThrow();
    return BLOCKS.getOrDefault(d.get("path").getAsString(), Blocks.STONE);
  }

  public static Item item(String path) {
    return Objects.requireNonNull(ITEMS.get(path), path);
  }

  public static SoundEvent sound(String name) {
    return SOUNDS.getOrDefault(name, SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME);
  }

  public static BlockState state(int legacy) {
    return LEGACY.getOrDefault(legacy, Blocks.AIR.getDefaultState());
  }

  public static String path(Item item) {
    return Registries.ITEM.getId(item).getPath();
  }

  public static String path(BlockState state) {
    return Registries.BLOCK.getId(state.getBlock()).getPath();
  }
}
