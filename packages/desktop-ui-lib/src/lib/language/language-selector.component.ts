import { AfterViewInit, Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
	ILanguage,
	IUser,
	IUserUpdateInput,
	LanguagesEnum,
} from '@gauzy/contracts';
import { UserOrganizationService } from '../time-tracker/organization-selector/user-organization.service';
import { LanguageService } from './language.service';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { tap, filter, from, BehaviorSubject, Observable } from 'rxjs';
import { Store } from '../services';
import { LanguageSelectorService } from './language-selector.service';
import { ElectronService } from '../electron/services';

@UntilDestroy({ checkProperties: true })
@Component({
	selector: 'gauzy-language-selector',
	templateUrl: './language-selector.component.html',
	styleUrls: ['./language-selector.component.scss'],
})
export class LanguageSelectorComponent implements OnInit, AfterViewInit {
	private _user: IUser;
	private _languages$: BehaviorSubject<ILanguage[]>;
	private _preferredLanguage: LanguagesEnum;

	constructor(
		private readonly _store: Store,
		private readonly _userService: UserOrganizationService,
		private readonly _translate: TranslateService,
		private readonly _languageService: LanguageService,
		private readonly _languageSelelectorService: LanguageSelectorService,
		private readonly _electronService: ElectronService
	) {
		this._languages$ = new BehaviorSubject([]);
		this._preferredLanguage = LanguagesEnum.ENGLISH;
	}

	ngOnInit(): void {
		this._store.systemLanguages$
			.pipe(
				filter((languages: ILanguage[]) => !!languages),
				tap((languages: ILanguage[]) =>
					this.systemLanguages(languages)
				),
				untilDestroyed(this)
			)
			.subscribe();
		this._store.user$
			.pipe(
				filter((user: IUser) => !!user),
				tap((user: IUser) => (this._user = user)),
				tap(({ preferredLanguage }: IUser) => {
					if (!this._store.preferredLanguage) {
						this._store.preferredLanguage =
							preferredLanguage || LanguagesEnum.ENGLISH;
					}
				}),
				untilDestroyed(this)
			)
			.subscribe();
		this._store.preferredLanguage$
			.pipe(
				filter(
					(preferredLanguage: LanguagesEnum) => !!preferredLanguage
				),
				tap(
					(preferredLanguage: LanguagesEnum) =>
						(this._preferredLanguage = preferredLanguage)
				),
				tap(() => this.setLanguage()),
				tap((preferredLanguage: LanguagesEnum) =>
					this._electronService.ipcRenderer.send(
						'preferred_language_change',
						preferredLanguage
					)
				),
				untilDestroyed(this)
			)
			.subscribe();
	}

	ngAfterViewInit() {
		const systemLanguages = this._store.systemLanguages;
		if (!systemLanguages) {
			from(this._loadLanguages());
		}
	}

	private async _loadLanguages() {
		const { items = [] } = await this._languageService.system();
		this._store.systemLanguages =
			items.filter((item: ILanguage) => item.is_system) || [];
	}

	public systemLanguages(systemLanguages: ILanguage[]) {
		if (systemLanguages && systemLanguages.length > 0) {
			this._languages$.next(
				systemLanguages
					.filter((item) => !!item.is_system)
					.map((item) => {
						return {
							value: item.code,
							name: 'SETTINGS_MENU.' + item.name.toUpperCase(),
						};
					})
			);
		} else {
			const languages = [];
			for (const [name, code] of Object.entries(LanguagesEnum)) {
				languages.push({
					code,
					name,
					is_system: true,
				});
			}
			this._store.systemLanguages = languages;
		}
	}

	public async switchLanguage(): Promise<void> {
		this._store.preferredLanguage = this._preferredLanguage;
		await this.changePreferredLanguage({
			preferredLanguage: this._preferredLanguage,
		});
	}

	public setLanguage(): void {
		this._languageSelelectorService.setLanguage(
			this.preferredLanguage,
			this._translate
		);
	}

	private async changePreferredLanguage(payload: IUserUpdateInput) {
		if (!this._user) {
			return;
		}
		try {
			await this._userService.updatePreferredLanguage(payload);
		} catch (error) {
			console.error(`Failed to update user preferred language`);
		}
	}

	public get languages$(): Observable<ILanguage[]> {
		return this._languages$.asObservable();
	}

	public get preferredLanguage(): LanguagesEnum {
		return this._preferredLanguage;
	}

	public set preferredLanguage(value: LanguagesEnum) {
		this._preferredLanguage = value;
	}
}
