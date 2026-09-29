import { MapPin, Phone, ArrowRight } from "lucide-react";
import type { Config } from "../shared/types";

export function Contacts({ cfg }: { cfg: Config }) {
  return (
    <section className="contacts-section" aria-labelledby="contacts-title">
      <div className="contacts-photo">
        <img
          src={cfg.contactImage}
          alt="Вход в Син Чао на Садовом кольце, 16/1 — вывеска «Вьетнамская кухня»"
          loading="lazy"
        />
        <span>Ждём вас в Син Чао</span>
      </div>
      <div className="contacts-copy">
        <div className="eyebrow">ОКТЯБРЬСКИЙ · БАШКОРТОСТАН</div>
        <h2 id="contacts-title">
          Немного Вьетнама.
          <br />
          <em>Совсем рядом.</em>
        </h2>
        <div className="contact-detail">
          <MapPin size={22} />
          <div>
            <h3>Садовое кольцо, 16/1</h3>
            <p>
              1 этаж · вход под вывеской «Син Чао»
              <br />
              Октябрьский, Республика Башкортостан, 452614
            </p>
          </div>
        </div>
        <div className="contact-detail">
          <Phone size={21} />
          <div>
            <a className="contact-phone" href={"tel:" + cfg.phone}>
              +7 908 351-67-77
            </a>
            <p>Заказы, наличие блюд и часы работы — по телефону.</p>
          </div>
        </div>
        <div className="contact-actions">
          <a
            className="primary"
            href={cfg.mapUrl}
            target="_blank"
            rel="noreferrer"
          >
            Построить маршрут <ArrowRight size={18} />
          </a>
          <a
            className="text-button"
            href="https://vk.ru/club240374933"
            target="_blank"
            rel="noreferrer"
          >
            Мы ВКонтакте ↗
          </a>
        </div>
      </div>
    </section>
  );
}
