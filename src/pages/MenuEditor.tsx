import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Category, Dish, ModifierGroup } from "../../shared/types";
import { DishPicture } from "../DishPicture";
import { DishFeatures, DishFeatureIcon } from "../DishFeatures";
import {
  dishFeatures,
  dishFeatureIds,
  dishFeatureLabels,
} from "../../shared/dish-features";
import "./menu-editor.css";

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
function EditorError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  return message ? (
    <p className="error" role="alert" tabIndex={-1} ref={ref}>
      {message}
    </p>
  ) : null;
}
const lines = (value: string) =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
function Field({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label>
      <span>{title}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}
function MoneyField({
  title,
  help,
  value,
  max = 100000,
  onChange,
}: {
  title: string;
  help: string;
  value: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value / 100));
  return (
    <Field title={title} help={help}>
      <input
        type="number"
        required
        min="0"
        max={max}
        step="0.01"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(Math.round(Number(e.target.value) * 100));
        }}
      />
    </Field>
  );
}
function Actions({ busy, close }: { busy: boolean; close: () => void }) {
  return (
    <div className="menu-editor-actions button-row">
      <button className="primary" disabled={busy}>
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={close}
      >
        Отмена
      </button>
    </div>
  );
}
function newDish(categories: Category[]): Dish {
  return {
    id: uid("dish"),
    categoryId: categories[0]?.id ?? "",
    name: "",
    localizedName: "",
    description: "",
    ingredients: [],
    price: 0,
    portion: "",
    image: "",
    allergens: [],
    tags: [],
    spice: 0,
    available: false,
    featured: false,
    orderable: true,
    region: "",
    modifiers: [],
  };
}
export function DishEditor({
  initial,
  categories,
  dishes,
  busy,
  error,
  save,
  close,
}: {
  initial?: Dish;
  categories: Category[];
  dishes: Dish[];
  busy: boolean;
  error: string;
  save: (dish: Dish) => Promise<void>;
  close: () => void;
}) {
  const [dish, setDish] = useState<Dish>(() =>
    initial
      ? { ...structuredClone(initial), features: dishFeatures(initial) }
      : { ...newDish(categories), features: [] },
  );
  const [ingredients, setIngredients] = useState(dish.ingredients.join("\n"));
  const [allergens, setAllergens] = useState(dish.allergens.join("\n"));
  const [tags, setTags] = useState(dish.tags.join("\n"));
  const [validation, setValidation] = useState("");
  const [photoSize, setPhotoSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [gallery, setGallery] = useState(false);
  const change = (patch: Partial<Dish>) => setDish((d) => ({ ...d, ...patch }));
  const groupChange = (id: string, patch: Partial<ModifierGroup>) =>
    change({
      modifiers: dish.modifiers.map((g) =>
        g.id === id ? { ...g, ...patch } : g,
      ),
    });
  const changePhoto = (image: string, crop?: Dish["imageCrop"]) => {
    change({ image, imageCrop: crop });
    setPhotoSize(null);
    setPhotoError(false);
  };
  return (
    <form
      className="standard-form menu-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setValidation("");
        const value = {
          ...dish,
          name: dish.name.trim(),
          localizedName: dish.localizedName.trim() || dish.name.trim(),
          ingredients: lines(ingredients),
          allergens: lines(allergens),
          tags: lines(tags),
        };
        if (!value.name || !value.categoryId)
          return setValidation("Укажите название и выберите категорию.");
        if (!(
          value.image.startsWith("/images/") ||
          value.image.startsWith("https://")
        ))
          return setValidation(
            "Выберите фотографию из меню или укажите ссылку, начинающуюся с https://.",
          );
        for (const [name, entries, limit] of [
          ["Состав", value.ingredients, 100],
          ["Аллергены", value.allergens, 60],
          ["Метки", value.tags, 60],
        ] as const) {
          if (entries.length > 30 || entries.some((s) => s.length > limit))
            return setValidation(
              `${name}: не более 30 строк, до ${limit} символов в каждой.`,
            );
        }
        const crop = value.imageCrop;
        if (
          crop &&
          (crop.width <= 0 ||
            crop.height <= 0 ||
            crop.x + crop.width > crop.sourceWidth ||
            crop.y + crop.height > crop.sourceHeight)
        )
          return setValidation(
            "Область фотографии выходит за границы оригинала. Уменьшите размер или отступы.",
          );
        for (const g of value.modifiers) {
          if (!g.name.trim() || g.options.some((o) => !o.name.trim()))
            return setValidation(
              "Укажите название каждой группы и каждого варианта.",
            );
          if (g.min > g.max || g.max > g.options.length)
            return setValidation(
              `«${g.name}»: минимум не должен превышать максимум, а максимум — количество вариантов.`,
            );
          if (g.options.filter((o) => o.available).length < g.min)
            return setValidation(
              `«${g.name}»: доступных вариантов меньше, чем обязательный минимум. Включите варианты или уменьшите минимум.`,
            );
        }
        await save(value);
      }}
    >
      <p className="muted">
        Заполните поля и нажмите «Сохранить». Все цены здесь — в рублях.
      </p>
      <fieldset disabled={busy} className="editor-fields">
        <section>
          <h3>Основное</h3>
          <div className="editor-grid">
            <Field
              title="Название блюда"
              help="Как блюдо называется в меню, например «Том ям»."
            >
              <input
                data-initial-focus
                required
                maxLength={100}
                value={dish.name}
                onChange={(e) => change({ name: e.target.value })}
              />
            </Field>
            <Field
              title="Короткое пояснение"
              help="Под названием, например «Суп с креветками и кальмарами». Можно оставить пустым."
            >
              <input
                maxLength={100}
                value={dish.localizedName}
                onChange={(e) => change({ localizedName: e.target.value })}
              />
            </Field>
            <Field
              title="Категория"
              help="В каком разделе меню показывать блюдо."
            >
              <select
                required
                value={dish.categoryId}
                onChange={(e) => change({ categoryId: e.target.value })}
              >
                <option value="" disabled>
                  Выберите категорию
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <MoneyField
              title="Цена, ₽"
              help="Основная цена. Доплаты за порцию и добавки задаются ниже."
              value={dish.price}
              onChange={(price) => change({ price })}
            />
            <Field
              title="Порция"
              help="Вес, объём или количество: «300 / 500 г», «4 шт.»."
            >
              <input
                maxLength={60}
                value={dish.portion}
                onChange={(e) => change({ portion: e.target.value })}
              />
            </Field>
            <Field
              title="Острота"
              help="Помогает гостям выбрать подходящее блюдо."
            >
              <select
                value={dish.spice}
                onChange={(e) => change({ spice: Number(e.target.value) })}
              >
                {["Не острое", "Слегка острое", "Острое", "Очень острое"].map(
                  (s, i) => (
                    <option key={i} value={i}>
                      {s}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </div>
          <Field
            title="Описание"
            help="Расскажите о вкусе и подаче. До 1500 символов."
          >
            <textarea
              rows={3}
              maxLength={1500}
              value={dish.description}
              onChange={(e) => change({ description: e.target.value })}
            />
          </Field>
          <div className="editor-checks">
            <label>
              <input
                type="checkbox"
                checked={dish.available}
                onChange={(e) => change({ available: e.target.checked })}
              />
              Доступно сейчас
              <small>Выключите, чтобы отправить блюдо в стоп-лист.</small>
            </label>
            <label>
              <input
                type="checkbox"
                checked={dish.orderable !== false}
                onChange={(e) => change({ orderable: e.target.checked })}
              />
              Можно заказать на сайте
              <small>
                Выключите для позиций, которые можно заказать только в
                ресторане.
              </small>
            </label>
            <label>
              <input
                type="checkbox"
                checked={dish.featured}
                onChange={(e) => change({ featured: e.target.checked })}
              />
              Рекомендуем гостям
              <small>Показывать среди избранных блюд ресторана.</small>
            </label>
          </div>
        </section>
        <section>
          <h3>Значки на карточке</h3>
          <p className="muted">
            Выберите особенности, которые увидят гости рядом с блюдом. Для
            старых позиций значки предварительно подобраны по указанному
            составу; их можно изменить или убрать. Вегетарианские и веганские
            блюда отмечайте после проверки полного состава.
          </p>
          <div className="feature-choices">
            <label>
              <input
                type="checkbox"
                checked={dish.spice > 0}
                onChange={(e) =>
                  change({
                    spice: e.target.checked ? Math.max(1, dish.spice) : 0,
                  })
                }
              />
              <DishFeatureIcon id="spicy" />
              Острое
            </label>
            {dishFeatureIds.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={dish.features?.includes(id) ?? false}
                  onChange={(e) =>
                    change({
                      features: e.target.checked
                        ? [...(dish.features ?? []), id]
                        : (dish.features?.filter((f) => f !== id) ?? []),
                    })
                  }
                />
                <DishFeatureIcon id={id} />
                {dishFeatureLabels[id]}
              </label>
            ))}
          </div>
          <p className="form-help">
            Степень остроты задаётся полем «Острота» выше. Остальные значки
            выбираются независимо.
          </p>
          <DishFeatures dish={dish} />
        </section>
        <section>
          <h3>Фотография</h3>
          <div className="editor-photo-row">
            <div className="editor-photo-preview">
              {dish.image ? (
                <DishPicture
                  key={dish.image + JSON.stringify(dish.imageCrop)}
                  dish={dish}
                  eager
                />
              ) : (
                <span>Выберите фотографию</span>
              )}
            </div>
            <div>
              <p>
                Можно взять фотографию из существующего меню или указать ссылку
                на новое изображение.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => setGallery(!gallery)}
                aria-expanded={gallery}
              >
                Выбрать из меню
              </button>
              {photoError && (
                <p className="error">
                  Фотография не загрузилась. Проверьте ссылку.
                </p>
              )}
            </div>
          </div>
          {gallery && (
            <div className="editor-photo-gallery">
              {dishes
                .filter((d) => d.image)
                .map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => {
                      changePhoto(d.image, d.imageCrop);
                      setGallery(false);
                    }}
                    aria-label={`Фото: ${d.name}`}
                  >
                    <DishPicture dish={d} />
                    <span>{d.name}</span>
                  </button>
                ))}
            </div>
          )}
          <details>
            <summary>Ссылка и область фотографии</summary>
            <Field
              title="Ссылка на фотографию"
              help="Адрес изображения из интернета (https://…) или путь к уже размещённой фотографии сайта."
            >
              <input
                type="text"
                maxLength={1000}
                value={dish.image}
                onChange={(e) => changePhoto(e.target.value)}
              />
            </Field>
            {dish.image && (
              <img
                key={dish.image}
                className="editor-photo-source"
                src={dish.image}
                alt="Исходная фотография"
                onLoad={(e) => {
                  setPhotoSize({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  });
                  setPhotoError(false);
                }}
                onError={() => setPhotoError(true)}
              />
            )}
            <p className="muted">
              Если фото взято с листа меню, можно показывать только нужный
              участок. Размеры и отступы — в пикселях оригинала.
            </p>
            {!dish.imageCrop ? (
              <button
                type="button"
                className="secondary"
                disabled={!photoSize}
                onClick={() =>
                  photoSize &&
                  change({
                    imageCrop: {
                      x: 0,
                      y: 0,
                      width: photoSize.width,
                      height: photoSize.height,
                      sourceWidth: photoSize.width,
                      sourceHeight: photoSize.height,
                    },
                  })
                }
              >
                Выбрать область
              </button>
            ) : (
              <>
                <p>
                  Размер оригинала: {dish.imageCrop.sourceWidth} ×{" "}
                  {dish.imageCrop.sourceHeight} пикселей.
                </p>
                <div className="editor-grid">
                  {(
                    [
                      ["x", "Отступ слева"],
                      ["y", "Отступ сверху"],
                      ["width", "Ширина области"],
                      ["height", "Высота области"],
                    ] as const
                  ).map(([key, title]) => (
                    <Field key={key} title={title}>
                      <input
                        type="number"
                        required
                        min={key === "x" || key === "y" ? 0 : 1}
                        step="any"
                        value={dish.imageCrop![key]}
                        onChange={(e) =>
                          change({
                            imageCrop: {
                              ...dish.imageCrop!,
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => change({ imageCrop: undefined })}
                >
                  Показывать фото целиком
                </button>
              </>
            )}
          </details>
        </section>
        <section>
          <h3>Порции и добавки</h3>
          <p className="muted">
            Например, группа «Порция» с вариантами «300 г» и «500 г». Цена
            варианта — доплата к основной цене, а не полная стоимость блюда.
          </p>
          {dish.modifiers.map((g, index) => (
            <fieldset className="modifier-editor" key={g.id}>
              <legend>
                Группа {index + 1}: {g.name || "Новая группа"}
              </legend>
              <div className="editor-grid">
                <Field title="Название группы">
                  <input
                    required
                    maxLength={80}
                    value={g.name}
                    onChange={(e) =>
                      groupChange(g.id, { name: e.target.value })
                    }
                  />
                </Field>
                <Field
                  title="Минимум вариантов"
                  help="0 — выбор необязателен, 1 — гость должен выбрать хотя бы один."
                >
                  <input
                    type="number"
                    required
                    min={0}
                    max={10}
                    value={g.min}
                    onChange={(e) =>
                      groupChange(g.id, { min: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field
                  title="Максимум вариантов"
                  help="1 — один размер порции. Больше 1 — можно выбрать несколько добавок."
                >
                  <input
                    type="number"
                    required
                    min={0}
                    max={Math.min(10, g.options.length)}
                    value={g.max}
                    onChange={(e) =>
                      groupChange(g.id, { max: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              {g.options.map((o, i) => (
                <div className="modifier-option" key={o.id}>
                  <Field title={`Вариант ${i + 1}`}>
                    <input
                      required
                      maxLength={80}
                      value={o.name}
                      onChange={(e) =>
                        groupChange(g.id, {
                          options: g.options.map((v) =>
                            v.id === o.id ? { ...v, name: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </Field>
                  <MoneyField
                    title="Доплата, ₽"
                    help="0 — без доплаты."
                    value={o.price}
                    max={10000}
                    onChange={(price) =>
                      groupChange(g.id, {
                        options: g.options.map((v) =>
                          v.id === o.id ? { ...v, price } : v,
                        ),
                      })
                    }
                  />
                  <div className="modifier-option-actions">
                    <label className="editor-toggle">
                      <input
                        type="checkbox"
                        checked={o.available}
                        onChange={(e) =>
                          groupChange(g.id, {
                            options: g.options.map((v) =>
                              v.id === o.id
                                ? { ...v, available: e.target.checked }
                                : v,
                            ),
                          })
                        }
                      />
                      Доступен
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Удалить вариант ${i + 1} из группы ${index + 1}`}
                      onClick={() =>
                        groupChange(g.id, {
                          options: g.options.filter((v) => v.id !== o.id),
                        })
                      }
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={g.options.length >= 20}
                  onClick={() =>
                    groupChange(g.id, {
                      options: [
                        ...g.options,
                        {
                          id: uid("option"),
                          name: "",
                          price: 0,
                          available: true,
                        },
                      ],
                    })
                  }
                >
                  Добавить вариант
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    change({
                      modifiers: dish.modifiers.filter((v) => v.id !== g.id),
                    })
                  }
                >
                  Удалить группу {index + 1}
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={dish.modifiers.length >= 10}
            onClick={() =>
              change({
                modifiers: [
                  ...dish.modifiers,
                  {
                    id: uid("group"),
                    name: "",
                    min: 0,
                    max: 1,
                    options: [
                      {
                        id: uid("option"),
                        name: "",
                        price: 0,
                        available: true,
                      },
                    ],
                  },
                ],
              })
            }
          >
            Добавить группу вариантов
          </button>
        </section>
        <section>
          <h3>Состав и особенности</h3>
          <div className="editor-grid">
            <Field
              title="Ингредиенты"
              help="Каждый ингредиент с новой строки. До 30 строк."
            >
              <textarea
                rows={4}
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
              />
            </Field>
            <Field
              title="Аллергены"
              help="Каждый аллерген с новой строки, например «арахис», «молоко». Указывайте только проверенную информацию."
            >
              <textarea
                rows={4}
                value={allergens}
                onChange={(e) => setAllergens(e.target.value)}
              />
            </Field>
            <Field
              title="Метки"
              help="Каждая с новой строки, например «Новинка». До 30 меток."
            >
              <textarea
                rows={3}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </Field>
            <Field
              title="Регион кухни"
              help="Для маршрута Food Journey, например «Северный Вьетнам». Можно оставить пустым."
            >
              <input
                maxLength={60}
                value={dish.region}
                onChange={(e) => change({ region: e.target.value })}
              />
            </Field>
          </div>
        </section>
      </fieldset>
      <EditorError message={validation || error} />
      <Actions busy={busy} close={close} />
    </form>
  );
}

export function CategoriesEditor({
  initial,
  dishes,
  busy,
  error,
  save,
  close,
}: {
  initial: Category[];
  dishes: Dish[];
  busy: boolean;
  error: string;
  save: (rows: Category[]) => Promise<void>;
  close: () => void;
}) {
  const [rows, setRows] = useState(() => structuredClone(initial));
  const [validation, setValidation] = useState("");
  const move = (index: number, delta: number) => {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setRows(next);
  };
  return (
    <form
      className="standard-form menu-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setValidation("");
        if (rows.some((r) => !r.name.trim()))
          return setValidation("Укажите название каждой категории.");
        await save(rows.map((r) => ({ ...r, name: r.name.trim() })));
      }}
    >
      <p className="muted">
        Разделы показываются гостям в этом порядке. Используйте стрелки, чтобы
        его изменить.
      </p>
      <fieldset disabled={busy} className="editor-fields">
        {rows.map((r, i) => {
          const count = dishes.filter((d) => d.categoryId === r.id).length;
          return (
            <section key={r.id} className="category-editor-row">
              <div className="editor-grid">
                <Field title={`Название категории ${i + 1}`}>
                  <input
                    data-initial-focus={i === 0 ? true : undefined}
                    required
                    maxLength={80}
                    value={r.name}
                    onChange={(e) =>
                      setRows(
                        rows.map((c) =>
                          c.id === r.id ? { ...c, name: e.target.value } : c,
                        ),
                      )
                    }
                  />
                </Field>
                <Field
                  title={`Описание категории ${i + 1}`}
                  help="Короткая подпись, например «Большая тарелка тепла». Можно оставить пустым."
                >
                  <input
                    maxLength={100}
                    value={r.subtitle}
                    onChange={(e) =>
                      setRows(
                        rows.map((c) =>
                          c.id === r.id
                            ? { ...c, subtitle: e.target.value }
                            : c,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              <div className="button-row">
                <span>Блюд: {count}</span>
                <button
                  type="button"
                  className="secondary"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Выше: ${r.name || i + 1}`}
                >
                  ↑ Выше
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Ниже: ${r.name || i + 1}`}
                >
                  ↓ Ниже
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={!!count || rows.length === 1}
                  onClick={() => setRows(rows.filter((c) => c.id !== r.id))}
                  aria-label={`Удалить категорию ${i + 1}`}
                >
                  Удалить
                </button>
              </div>
              {!!count && (
                <p className="form-help">
                  Чтобы удалить категорию, сначала перенесите её блюда в другой
                  раздел.
                </p>
              )}
            </section>
          );
        })}
        <button
          type="button"
          className="secondary"
          disabled={rows.length >= 30}
          onClick={() =>
            setRows([...rows, { id: uid("category"), name: "", subtitle: "" }])
          }
        >
          Добавить категорию
        </button>
      </fieldset>
      <EditorError message={validation || error} />
      <Actions busy={busy} close={close} />
    </form>
  );
}
