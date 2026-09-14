import styles from "./FullDayRentalMessage.module.css";

export function FullDayRentalMessage({message}:{message?:string|null}) {
 if(!message?.trim())return null;
 const [heading,...body]=message.trim().split("\n");
 return <aside className={styles.notice} aria-label="Rental duration information"><strong className={styles.heading}>{heading}</strong>{body.length>0&&<span className={styles.body}>{body.join("\n").trim()}</span>}</aside>;
}
